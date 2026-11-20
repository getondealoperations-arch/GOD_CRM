import Link from "next/link";
import { notFound } from "next/navigation";
import { can, leadScope, requireUser } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { getPriorities, PAYMENT_STATUSES, transitionAllowed } from "@/lib/leads";
import { waAllowed, waConfigured } from "@/lib/channels";
import { telephonyEnabled } from "@/lib/telephony";
import { inr } from "@/lib/metrics";
import { CallPanel } from "@/components/call-panel";
import { dur, fmtDate, fmtDay, PriorityBadge, StageBadge, tomorrowLocal } from "@/components/ui";
import {
  addNote, addPayment, anonymizeLeadAction, assignAction, completeFollowup, createSale, deleteLead, reassignFollowup, scheduleFollowup, sendLeadWhatsApp,
  setSaleStatus, stageAction, updateLead,
} from "../../actions";

const PREFS = [["call", "Phone call"], ["whatsapp", "WhatsApp"], ["sms", "SMS"], ["email", "Email"]];

export default async function LeadDetail({ params }: PageProps<"/leads/[id]">) {
  const u = await requireUser();
  const id = Number((await params).id);
  const sc = leadScope(u);
  const l = await one(
    `SELECT l.*, s.name stage, s.color, s.is_lost, s.allowed_next, ou.name owner, c.name campaign FROM leads l JOIN stages s ON s.id=l.stage_id
     LEFT JOIN users ou ON ou.id=l.owner_id LEFT JOIN campaigns c ON c.id=l.campaign_id WHERE l.id=? AND ${sc.sql}`, [id, ...sc.params]);
  if (!l) notFound();

  const [stages, users, acts, calls, fus, history, sales, touches, priorities, wa, tel] = await Promise.all([
    q("SELECT * FROM stages ORDER BY position"),
    q("SELECT id, name FROM users WHERE active=1 AND role<>'viewer' ORDER BY name"),
    q("SELECT a.*, us.name user FROM lead_activities a LEFT JOIN users us ON us.id=a.user_id WHERE a.lead_id=? ORDER BY a.id DESC LIMIT 200", [id]),
    q("SELECT c.*, us.name user FROM calls c LEFT JOIN users us ON us.id=c.user_id WHERE c.lead_id=? ORDER BY c.started_at DESC", [id]),
    q("SELECT f.*, us.name user FROM followups f LEFT JOIN users us ON us.id=f.assigned_to WHERE f.lead_id=? ORDER BY f.status='pending' DESC, f.due_at DESC", [id]),
    q(`SELECT h.*, fs.name from_name, ts.name to_name, us.name user FROM stage_history h LEFT JOIN stages fs ON fs.id=h.from_stage_id
       JOIN stages ts ON ts.id=h.to_stage_id LEFT JOIN users us ON us.id=h.user_id WHERE h.lead_id=? ORDER BY h.id DESC`, [id]),
    q(`SELECT sa.*, c.name campaign, COALESCE((SELECT SUM(amount) FROM payments p WHERE p.sale_id=sa.id),0) paid FROM sales sa
       LEFT JOIN campaigns c ON c.id=sa.campaign_id WHERE sa.lead_id=? ORDER BY sa.id DESC`, [id]),
    q("SELECT t.*, c.name campaign FROM lead_touches t LEFT JOIN campaigns c ON c.id=t.campaign_id WHERE t.lead_id=? ORDER BY t.touched_at, t.id", [id]),
    getPriorities(), waConfigured(), telephonyEnabled(),
  ]);
  const nextStages = stages.filter((st) => st.id === l.stage_id || transitionAllowed(l.allowed_next, st.id));
  const prefs = String(l.comm_pref ?? "").split(",");
  const payments = sales.length ? await q("SELECT * FROM payments WHERE sale_id IN (?) ORDER BY paid_at DESC", [sales.map((s) => s.id)]) : [];
  const edit = can(u, "lead.edit");
  const field = (label: string, name: string, type = "text") => (
    <div><label className="label" htmlFor={name}>{label}</label><input id={name} name={name} type={type} defaultValue={l[name] ?? ""} className="input" disabled={!edit} /></div>
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">{l.lead_code} · created {fmtDate(l.created_at)} via {l.source}</div>
          <h1 className="h1">{l.name} {l.business_name && <span className="font-normal text-slate-500">· {l.business_name}</span>}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <StageBadge name={l.stage} color={l.color} /><PriorityBadge p={l.priority} />
            <span>Owner: <b>{l.owner ?? "Unassigned"}</b></span>
            <span>· {l.total_calls} calls · last contact {fmtDate(l.last_contact_at)}</span>
            {l.in_reactivation ? <span className="badge bg-amber-100 text-amber-800">Reactivation queue</span> : null}
            {l.dnd ? <span className="badge bg-red-100 text-red-700">DND</span> : null}
            {l.anonymized_at ? <span className="badge bg-slate-100 text-slate-600">Anonymised {fmtDay(l.anonymized_at)}</span> : null}
            {l.win_prob != null && !l.anonymized_at && <span className="badge bg-indigo-50 text-indigo-700" title="Lead score (0–100) and predicted win probability, from your historical conversions">
              Score {l.score} · {Number(l.win_prob).toFixed(0)}% win</span>}
          </div>
        </div>
        {can(u, "lead.delete") && (
          <div className="flex gap-2">
            {!l.anonymized_at && <form action={anonymizeLeadAction}><input type="hidden" name="id" value={id} />
              <button className="btn-ghost" title="Erase personal data (DPDP request) but keep the record for reports">Anonymise</button></form>}
            <form action={deleteLead}><input type="hidden" name="id" value={id} /><button className="btn-danger">Delete lead</button></form>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <form action={updateLead} className="card grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="id" value={id} />
            {field("Name", "name")}{field("Mobile", "mobile", "tel")}{field("Alternate mobile", "alt_mobile", "tel")}
            {field("Email", "email", "email")}{field("Business name", "business_name")}{field("Category", "category")}
            {field("City", "city")}{field("Source", "source")}
            <div><label className="label" htmlFor="priority">Priority</label>
              <select id="priority" name="priority" defaultValue={l.priority} className="input" disabled={!edit}>{[...new Set([...priorities, l.priority])].map((p) => <option key={p}>{p}</option>)}</select></div>
            {field("Tags", "tags")}{field("Expected revenue", "expected_revenue", "number")}
            <div className="flex items-end gap-3 text-sm">
              <label className="flex items-center gap-1" title={l.consent_at ? `Since ${fmtDate(l.consent_at)} · ${l.consent_source ?? ""}` : ""}><input type="checkbox" name="consent" defaultChecked={!!l.consent} disabled={!edit} /> Consent</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="dnd" defaultChecked={!!l.dnd} disabled={!edit} /> DND</label>
            </div>
            <fieldset className="sm:col-span-3">
              <legend className="label">Contact preference (none ticked = any) {l.consent_at && <span className="font-normal">· consent recorded {fmtDate(l.consent_at)}{l.consent_source ? ` (${l.consent_source})` : ""}</span>}</legend>
              <div className="flex flex-wrap gap-3 text-sm">{PREFS.map(([v, label]) => (
                <label key={v} className="flex items-center gap-1"><input type="checkbox" name="comm_pref" value={v} defaultChecked={prefs.includes(v)} disabled={!edit} /> {label}</label>
              ))}</div>
            </fieldset>
            <div className="sm:col-span-3"><label className="label" htmlFor="remarks">Remarks</label><textarea id="remarks" name="remarks" defaultValue={l.remarks ?? ""} className="input" rows={2} disabled={!edit} /></div>
            <div className="text-xs text-slate-500 sm:col-span-2">
              Campaign: {l.campaign ?? l.campaign_name ?? "—"} · Ad set: {l.adset_name ?? "—"} · Ad: {l.ad_name ?? "—"} · Form: {l.form_name ?? "—"}
              {l.meta_lead_id && <> · Meta lead {l.meta_lead_id}</>}
            </div>
            {edit && <div className="text-right"><button className="btn">Save changes</button></div>}
          </form>

          <section className="card">
            <h2 className="h2">Sales & payments</h2>
            {sales.map((s) => (
              <div key={s.id} className="mb-3 rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><b>{s.product}</b> · {fmtDay(s.sale_date)} · {s.invoice_no ?? "no invoice"} · <span className="badge bg-slate-100 text-slate-600">{s.status}</span>
                    <span className="text-xs text-slate-500"> · credited to {s.campaign ?? "no campaign"}{s.attribution ? ` (${s.attribution.replace("_", " ")})` : ""}</span></div>
                  <div>Order {inr(s.order_value)} · Paid {inr(s.paid)} · Pending {inr(Math.max(0, s.order_value - s.paid))} · GP {inr(s.gross_profit)}</div>
                </div>
                <ul className="mt-1 text-xs text-slate-600">{payments.filter((p) => p.sale_id === s.id).map((p) => <li key={p.id}>{fmtDay(p.paid_at)} · {inr(p.amount)} · {p.mode} {p.reference_id && `· ref ${p.reference_id}`}</li>)}</ul>
                {can(u, "sales.manage") && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={addPayment} className="flex flex-wrap gap-1">
                      <input type="hidden" name="sale_id" value={s.id} />
                      <input name="amount" type="number" step="0.01" placeholder="Amount (−ve = refund)" required className="input w-40" />
                      <select name="mode" className="input w-auto" aria-label="Payment mode">{["UPI", "Bank Transfer", "Card", "Cash", "Cheque"].map((m) => <option key={m}>{m}</option>)}</select>
                      <input name="reference_id" placeholder="Txn / ref ID" className="input w-32" />
                      <input name="paid_at" type="date" className="input w-36" aria-label="Paid on" />
                      <button className="btn-ghost">Add payment</button>
                    </form>
                    <form action={setSaleStatus} className="flex gap-1">
                      <input type="hidden" name="sale_id" value={s.id} />
                      <select name="status" defaultValue={s.status} className="input w-auto" aria-label="Sale status">{PAYMENT_STATUSES.map((p) => <option key={p}>{p}</option>)}</select>
                      <button className="btn-ghost">Set</button>
                    </form>
                  </div>
                )}
              </div>
            ))}
            {can(u, "sales.manage") && (
              <details open={!sales.length && !!l.stage?.match(/Won|Payment|Negotiation/)}>
                <summary className="cursor-pointer text-sm font-medium text-indigo-700">+ Record a sale for this lead</summary>
                <form action={createSale} className="mt-2 grid gap-2 sm:grid-cols-4">
                  <input type="hidden" name="lead_id" value={id} />
                  <input name="product" placeholder="Product / service *" required className="input sm:col-span-2" />
                  <input name="order_value" type="number" step="0.01" min="1" placeholder="Order value *" required className="input" />
                  <input name="gross_profit" type="number" step="0.01" placeholder="Gross profit" className="input" />
                  <input name="sale_date" type="date" className="input" aria-label="Sale date" />
                  <input name="invoice_no" placeholder="Invoice no." className="input" />
                  <input name="amount_received" type="number" step="0.01" placeholder="Amount received now" className="input" />
                  <select name="mode" className="input" aria-label="Payment mode">{["UPI", "Bank Transfer", "Card", "Cash", "Cheque"].map((m) => <option key={m}>{m}</option>)}</select>
                  <input name="reference_id" placeholder="Txn / ref ID" className="input" />
                  <button className="btn sm:col-span-4">Save sale (marks lead Converted)</button>
                </form>
              </details>
            )}
          </section>

          <section className="card overflow-x-auto">
            <h2 className="h2">Call history ({calls.length})</h2>
            <table className="tbl">
              <thead><tr><th>When</th><th>By</th><th>Disposition</th><th>Duration</th><th>Remarks</th></tr></thead>
              <tbody>{calls.map((c) => (
                <tr key={c.id}><td className="whitespace-nowrap">{fmtDate(c.started_at)}</td><td>{c.user}</td><td>{c.disposition}</td><td>{dur(c.duration_sec)}</td>
                  <td>{c.remarks}{c.recording_url && <audio controls src={c.recording_url} className="mt-1 h-8" />}</td></tr>
              ))}</tbody>
            </table>
          </section>

          {touches.length > 0 && (
            <section className="card overflow-x-auto">
              <h2 className="h2">Marketing touches ({touches.length}) — used for attribution</h2>
              <table className="tbl">
                <thead><tr><th>When</th><th>Source</th><th>Channel</th><th>Campaign</th><th>Ad set / ad</th></tr></thead>
                <tbody>{touches.map((t) => (
                  <tr key={t.id}><td className="whitespace-nowrap">{fmtDate(t.touched_at)}</td><td>{t.source}</td><td>{t.channel}</td><td>{t.campaign ?? "—"}</td>
                    <td className="text-xs">{[t.adset_name, t.ad_name].filter(Boolean).join(" / ") || "—"}</td></tr>
                ))}</tbody>
              </table>
            </section>
          )}

          <section className="card overflow-x-auto">
            <h2 className="h2">Stage history</h2>
            <table className="tbl">
              <thead><tr><th>When</th><th>From → To</th><th>By</th><th>Time in previous stage</th></tr></thead>
              <tbody>{history.map((h) => (
                <tr key={h.id}><td className="whitespace-nowrap">{fmtDate(h.changed_at)}</td><td>{h.from_name ?? "—"} → {h.to_name}</td><td>{h.user ?? "system"}</td><td>{dur(h.seconds_in_prev)}</td></tr>
              ))}</tbody>
            </table>
          </section>

          <section className="card">
            <h2 className="h2">Activity timeline</h2>
            <form action={addNote} className="mb-3 flex gap-2">
              <input type="hidden" name="lead_id" value={id} />
              <input name="note" placeholder="Add a note…" required className="input" />
              <button className="btn-ghost">Add</button>
            </form>
            <ol className="space-y-2 border-l border-slate-200 pl-4 text-sm">
              {acts.map((a) => (
                <li key={a.id}>
                  <span className="badge mr-1 bg-slate-100 text-slate-600">{a.type}</span>{a.message}
                  <div className="text-xs text-slate-400">{fmtDate(a.created_at)} · {a.user ?? "system"}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-4">
          {can(u, "calls.log") && <section className="card"><h2 className="h2">Log a call</h2><CallPanel lead={l} stages={nextStages} telephony={tel} /></section>}

          {edit && wa && (
            <section className="card">
              <h2 className="h2">WhatsApp</h2>
              {waAllowed(l as never) ? (
                <form action={sendLeadWhatsApp} className="space-y-2">
                  <input type="hidden" name="lead_id" value={id} />
                  <input name="template" placeholder="Approved template name (optional)" className="input" />
                  <input name="params" placeholder="Template variables, separated by |" className="input" />
                  <textarea name="text" rows={2} placeholder="…or a free-text reply (only within 24h of the customer's last message)" className="input" />
                  <button className="btn-ghost w-full">Send WhatsApp</button>
                </form>
              ) : <p className="text-xs text-slate-500">Not allowed: the lead has no consent, is on DND, or prefers another channel.</p>}
            </section>
          )}

          {edit && (
            <section className="card">
              <h2 className="h2">Pipeline stage</h2>
              <form action={stageAction} className="space-y-2">
                <input type="hidden" name="lead_id" value={id} />
                <select name="stage_id" defaultValue={l.stage_id} className="input" aria-label="Stage">{nextStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                {nextStages.length < stages.length && <p className="text-xs text-slate-500">Only stages allowed by the pipeline transition rules are shown.</p>}
                <input name="lost_reason" placeholder="Lost reason (required when moving to Lost)" defaultValue={l.lost_reason ?? ""} className="input" />
                <button className="btn-ghost w-full">Update stage</button>
              </form>
            </section>
          )}

          {can(u, "lead.assign") && (
            <section className="card">
              <h2 className="h2">Owner</h2>
              <form action={assignAction} className="flex gap-2">
                <input type="hidden" name="lead_id" value={id} />
                <select name="owner_id" defaultValue={l.owner_id ?? ""} className="input" aria-label="Owner"><option value="">Unassigned</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                <button className="btn-ghost">Assign</button>
              </form>
            </section>
          )}

          <section className="card">
            <h2 className="h2">Follow-ups</h2>
            {edit && (
              <form action={scheduleFollowup} className="mb-3 space-y-2">
                <input type="hidden" name="lead_id" value={id} />
                <input type="datetime-local" name="due_at" required defaultValue={tomorrowLocal()} className="input" aria-label="Due at" />
                {can(u, "lead.assign") && <select name="assigned_to" defaultValue={l.owner_id ?? ""} className="input" aria-label="Responsible"><option value="">Lead owner</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
                <input name="note" placeholder="What to discuss" className="input" />
                <button className="btn-ghost w-full">Schedule follow-up</button>
              </form>
            )}
            <ul className="space-y-2 text-sm">
              {fus.map((f) => (
                <li key={f.id} className="rounded border border-slate-200 p-2">
                  <div className={f.status === "pending" && new Date(f.due_at.replace(" ", "T")) < new Date() ? "font-medium text-red-600" : ""}>
                    {fmtDate(f.due_at)} · {f.user} · <i>{f.status}</i>{f.escalated ? " · escalated" : ""}
                  </div>
                  {f.note && <div className="text-xs text-slate-500">{f.note}</div>}
                  {f.outcome && <div className="text-xs">Outcome: {f.outcome}</div>}
                  {f.status === "pending" && (
                    <div className="mt-1 space-y-1">
                      <form action={completeFollowup} className="flex gap-1">
                        <input type="hidden" name="id" value={f.id} />
                        <input name="outcome" placeholder="Outcome" className="input py-1 text-xs" />
                        <button className="btn-ghost px-2 py-1 text-xs">Done</button>
                        <button name="status" value="cancelled" className="btn-ghost px-2 py-1 text-xs">Cancel</button>
                      </form>
                      {can(u, "lead.assign") && (
                        <form action={reassignFollowup} className="flex gap-1">
                          <input type="hidden" name="id" value={f.id} />
                          <select name="assigned_to" defaultValue={f.assigned_to ?? ""} className="input py-1 text-xs" aria-label="Reassign follow-up">{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                          <button className="btn-ghost px-2 py-1 text-xs">Reassign</button>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <Link href="/leads" className="link text-sm">← Back to leads</Link>
        </div>
      </div>
    </>
  );
}
