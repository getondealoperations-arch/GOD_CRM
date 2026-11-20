import Link from "next/link";
import { can, leadScope, requireUser } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { str, type SP } from "@/lib/filters";
import { CallPanel } from "@/components/call-panel";
import { getPriorities, prioritySql, transitionAllowed } from "@/lib/leads";
import { telephonyEnabled } from "@/lib/telephony";
import { dur, Empty, fmtDate, PriorityBadge, StageBadge, Stat } from "@/components/ui";

export default async function Calling({ searchParams }: PageProps<"/calling">) {
  const u = await requireUser("calls.log");
  const sp = (await searchParams) as SP;
  const supervisor = can(u, "lead.view_all") || can(u, "lead.view_team");
  const agentId = supervisor && str(sp.agent) ? Number(str(sp.agent)) : u.id;
  const agents = supervisor
    ? await q(`SELECT id, name FROM users WHERE active=1 AND role IN ('calling_executive','sales_executive','team_leader')
        ${can(u, "lead.view_all") ? "" : "AND team_id=" + Number(u.team_id ?? -1)} ORDER BY name`) : [];

  const [st] = await q(
    `SELECT
       (SELECT COUNT(*) FROM leads l JOIN stages s ON s.id=l.stage_id WHERE l.owner_id=? AND s.is_won=0 AND s.is_lost=0) assigned,
       (SELECT COUNT(*) FROM leads l WHERE l.owner_id=? AND l.total_calls=0) new_leads,
       (SELECT COUNT(*) FROM followups f WHERE f.assigned_to=? AND f.status='pending' AND f.due_at<=NOW()) calls_due,
       (SELECT COUNT(*) FROM followups f WHERE f.assigned_to=? AND f.status='pending' AND DATE(f.due_at)=CURDATE()) fu_today,
       (SELECT COUNT(*) FROM calls c WHERE c.user_id=? AND DATE(c.started_at)=CURDATE()) calls_today,
       (SELECT COUNT(*) FROM calls c WHERE c.user_id=? AND DATE(c.started_at)=CURDATE() AND c.disposition IN ('Connected','Interested','Call Back Requested','Follow-up Required','Converted','Not Interested')) connected_today,
       (SELECT COALESCE(SUM(duration_sec),0) FROM calls c WHERE c.user_id=? AND DATE(c.started_at)=CURDATE()) talk_today,
       (SELECT COUNT(*) FROM leads l JOIN stages s ON s.id=l.stage_id WHERE l.owner_id=? AND s.name='Interested') interested,
       (SELECT COUNT(*) FROM sales sa WHERE sa.user_id=? AND MONTH(sa.sale_date)=MONTH(CURDATE()) AND YEAR(sa.sale_date)=YEAR(CURDATE())) converted_month,
       (SELECT target_calls FROM users WHERE id=?) target_calls`,
    Array(10).fill(agentId));

  // Work queue: overdue/due follow-ups → never-called leads → follow-ups today → reactivation.
  // Within each group the lead score (win probability, priority, engagement, recency) decides who is called first.
  const prio = prioritySql(await getPriorities());
  const queue = await q(
    `SELECT l.id, l.name, l.mobile, l.business_name, l.priority, l.score, l.total_calls, l.next_followup_at, l.created_at, s.name stage, s.color,
       CASE WHEN l.next_followup_at<=NOW() THEN 'Follow-up due' WHEN l.total_calls=0 THEN 'New lead'
            WHEN DATE(l.next_followup_at)=CURDATE() THEN 'Follow-up today' ELSE 'Reactivation' END reason,
       CASE WHEN l.next_followup_at<=NOW() THEN 0 WHEN l.total_calls=0 THEN 1 WHEN DATE(l.next_followup_at)=CURDATE() THEN 2 ELSE 3 END bucket
     FROM leads l JOIN stages s ON s.id=l.stage_id
     WHERE l.owner_id=? AND s.is_won=0 AND s.is_lost=0 AND l.dnd=0
       AND (l.next_followup_at<=NOW() + INTERVAL 30 MINUTE OR l.total_calls=0 OR DATE(l.next_followup_at)=CURDATE() OR l.in_reactivation=1)
     ORDER BY bucket, l.score DESC, ${prio}, COALESCE(l.next_followup_at, l.created_at) LIMIT 100`, [agentId]);

  const sc = leadScope(u);
  const selId = str(sp.lead) ? Number(str(sp.lead)) : queue[0]?.id;
  const lead = selId ? await one(`SELECT l.*, s.name stage, s.color, s.allowed_next FROM leads l JOIN stages s ON s.id=l.stage_id WHERE l.id=? AND ${sc.sql}`, [selId, ...sc.params]) : undefined;
  const [stages, history, pendingFu] = lead ? await Promise.all([
    q("SELECT id, name FROM stages ORDER BY position").then((all) => all.filter((st) => st.id === lead.stage_id || transitionAllowed(lead.allowed_next, st.id))),
    q("SELECT c.*, us.name user FROM calls c LEFT JOIN users us ON us.id=c.user_id WHERE c.lead_id=? ORDER BY c.started_at DESC LIMIT 5", [lead.id]),
    q("SELECT * FROM followups WHERE lead_id=? AND status='pending' ORDER BY due_at", [lead.id]),
  ]) : [[], [], []];
  const tel = await telephonyEnabled();
  const nextUrl = `/calling${agentId !== u.id ? `?agent=${agentId}` : ""}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">Calling workspace</h1>
        {supervisor && (
          <form className="flex gap-2">
            <select name="agent" defaultValue={agentId} className="input w-auto" aria-label="Agent">
              <option value={u.id}>My queue</option>{agents.filter((a) => a.id !== u.id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button className="btn-ghost">View</button>
          </form>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Assigned (open)" value={st.assigned} />
        <Stat label="New leads" value={st.new_leads} />
        <Stat label="Calls due" value={<span className={st.calls_due ? "text-red-600" : ""}>{st.calls_due}</span>} />
        <Stat label="Follow-ups today" value={st.fu_today} />
        <Stat label="Calls today" value={st.calls_today} sub={st.target_calls ? `target ${st.target_calls}` : undefined} />
        <Stat label="Connected today" value={st.connected_today} sub={`talk ${dur(Number(st.talk_today))}`} />
        <Stat label="Interested" value={st.interested} />
        <Stat label="Converted (month)" value={st.converted_month} />
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="card p-0 lg:col-span-2">
          <h2 className="h2 px-4 pt-4">Queue ({queue.length})</h2>
          <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
            {queue.map((x) => (
              <li key={x.id}>
                <Link href={`/calling?lead=${x.id}${agentId !== u.id ? `&agent=${agentId}` : ""}`}
                  className={`block px-4 py-2 text-sm hover:bg-slate-50 ${x.id === lead?.id ? "bg-indigo-50" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{x.name}</span>
                    <span className={`badge ${x.bucket === 0 ? "bg-red-100 text-red-700" : x.bucket === 1 ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{x.reason}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{x.mobile} · {x.stage} · score {x.score}</span><span>{x.next_followup_at ? fmtDate(x.next_followup_at) : `${x.total_calls} calls`}</span>
                  </div>
                </Link>
              </li>
            ))}
            {!queue.length && <Empty>Queue is clear. 🎉</Empty>}
          </ul>
        </section>

        <section className="card lg:col-span-3">
          {lead ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={`/leads/${lead.id}`} className="text-lg font-semibold hover:underline">{lead.name}</Link>
                  <div className="text-sm text-slate-500">{lead.business_name} · {lead.city} · {lead.category} · {lead.source}{lead.campaign_name ? ` / ${lead.campaign_name}` : ""}</div>
                </div>
                <div className="flex gap-1"><StageBadge name={lead.stage} color={lead.color} /><PriorityBadge p={lead.priority} /></div>
              </div>
              {lead.remarks && <p className="rounded bg-slate-50 p-2 text-sm">{lead.remarks}</p>}
              {pendingFu.map((f) => <p key={f.id} className="text-sm">📅 Follow-up {fmtDate(f.due_at)}{f.note ? ` — ${f.note}` : ""}</p>)}
              {history.length > 0 && (
                <ul className="text-xs text-slate-500">{history.map((h) => <li key={h.id}>{fmtDate(h.started_at)} · {h.user} · {h.disposition}{h.remarks ? ` — ${h.remarks}` : ""}</li>)}</ul>
              )}
              <CallPanel key={lead.id} lead={lead} stages={stages} next={nextUrl} telephony={tel} />
            </div>
          ) : <Empty>Select a lead from the queue.</Empty>}
        </section>
      </div>
      <p className="text-xs text-slate-500">
        {tel ? "Click-to-call rings your phone through the cloud telephony provider; duration, status and the recording are saved to the call automatically."
          : "Click-to-call opens your phone dialer (tel:). Connect cloud telephony in Settings → Meta, telephony & API for automatic call logs and recordings."}
        {" "}Queue order: due follow-ups, new leads, today’s follow-ups, reactivation — highest lead score first within each.
      </p>
    </>
  );
}
