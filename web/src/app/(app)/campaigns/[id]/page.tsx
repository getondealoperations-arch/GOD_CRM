import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { type SP } from "@/lib/filters";
import { inr, pct, ratio } from "@/lib/metrics";
import { aggregate, dateRange, withRange } from "@/lib/reports";
import { fmtDay, num, Stat } from "@/components/ui";
import { addSpend, deleteSpend } from "../../actions";
import { CampaignForm } from "@/components/campaign-form";

export default async function CampaignDetail({ params, searchParams }: PageProps<"/campaigns/[id]">) {
  const u = await requireUser("reports.view");
  const id = Number((await params).id);
  const c = await one("SELECT * FROM campaigns WHERE id=?", [id]);
  if (!c) notFound();
  const sp = withRange({ ...((await searchParams) as SP), campaign: String(id) });
  const { from, to } = dateRange(sp);
  const [[k], adsets, ads, spend, users] = await Promise.all([
    aggregate(u, sp, "all"),
    aggregate(u, sp, "adset"),
    aggregate(u, sp, "ad"),
    q("SELECT e.*, us.name user FROM spend_entries e LEFT JOIN users us ON us.id=e.created_by WHERE e.campaign_id=? ORDER BY e.spend_date DESC LIMIT 200", [id]),
    q("SELECT id, name FROM users WHERE active=1 AND role IN ('marketing_manager','admin','super_admin','sales_manager') ORDER BY name"),
  ]);
  const manage = can(u, "campaign.manage");

  return (
    <>
      <div>
        <Link href="/campaigns" className="link text-sm">← Campaigns</Link>
        <h1 className="h1">{c.name}</h1>
        <p className="text-sm text-slate-500">{c.channel} · {c.status} · budget {inr(c.budget)} · {from} → {to}</p>
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <div><label className="label" htmlFor="from">From</label><input id="from" type="date" name="from" defaultValue={from} className="input" /></div>
        <div><label className="label" htmlFor="to">To</label><input id="to" type="date" name="to" defaultValue={to} className="input" /></div>
        <button className="btn-ghost">Apply</button>
      </form>
      {k && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <Stat label="Spend" value={inr(k.spend)} /><Stat label="Leads" value={num(k.leads)} href={`/leads?campaign=${id}&from=${from}&to=${to}`} />
          <Stat label="Qualified" value={num(k.qualified)} /><Stat label="Converted" value={num(k.converted)} sub={pct(k.convRate)} />
          <Stat label="Revenue" value={inr(k.revenue)} sub={`GP ${inr(k.grossProfit)}`} /><Stat label="CPL" value={inr(k.cpl)} />
          <Stat label="CAC" value={inr(k.cac)} /><Stat label="ROAS / ROI" value={ratio(k.roas)} sub={`ROI ${pct(k.roi)}`} />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {[["Ad sets", adsets], ["Ads", ads]].map(([title, rows]) => (
          <section key={title as string} className="card overflow-x-auto p-0">
            <h2 className="h2 px-4 pt-4">{title as string}</h2>
            <table className="tbl">
              <thead><tr><th>Name</th><th className="text-right">Leads</th><th className="text-right">Qualified</th><th className="text-right">Converted</th><th className="text-right">Revenue</th></tr></thead>
              <tbody>{(rows as typeof adsets).map((r) => (
                <tr key={r.key}><td>{r.label}</td><td className="text-right">{r.leads}</td><td className="text-right">{r.qualified}</td><td className="text-right">{r.converted}</td><td className="text-right">{inr(r.revenue)}</td></tr>
              ))}</tbody>
            </table>
          </section>
        ))}
      </div>

      <section className="card">
        <h2 className="h2">Spend entries</h2>
        {manage && (
          <form action={addSpend} className="mb-3 flex flex-wrap gap-2">
            <input type="hidden" name="campaign_id" value={id} />
            <input type="date" name="spend_date" required className="input w-40" aria-label="Spend date" />
            <input type="number" name="amount" step="0.01" required placeholder="Amount (−ve to adjust)" className="input w-48" />
            <input name="note" placeholder="Note" className="input w-56" />
            <button className="btn-ghost">Add spend</button>
          </form>
        )}
        <div className="max-h-80 overflow-y-auto">
          <table className="tbl">
            <thead><tr><th>Date</th><th className="text-right">Amount</th><th>Source</th><th>Note</th><th>By</th><th /></tr></thead>
            <tbody>{spend.map((e) => (
              <tr key={e.id}><td>{fmtDay(e.spend_date)}</td><td className="text-right tabular-nums">{inr(e.amount)}</td><td>{e.source}</td><td>{e.note}</td><td>{e.user ?? "—"}</td>
                <td>{manage && e.source === "manual" && <form action={deleteSpend}><input type="hidden" name="id" value={e.id} /><button className="text-xs text-red-600">delete</button></form>}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      {manage && <details className="card"><summary className="cursor-pointer font-medium text-indigo-700">Edit campaign</summary><CampaignForm c={c} users={users as never} /></details>}
    </>
  );
}
