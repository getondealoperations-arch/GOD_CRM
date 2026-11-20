import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { filterQuery, leadWhere, type SP } from "@/lib/filters";
import { inr, pct, ratio } from "@/lib/metrics";
import { aggregate, dateRange, QUALIFIED_SQL, withRange } from "@/lib/reports";
import { FilterBar } from "@/components/filter-bar";
import { num, Stat } from "@/components/ui";

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const u = await requireUser();
  const sp = withRange((await searchParams) as SP);
  const { from, to } = dateRange(sp);
  const cohort = leadWhere(u, sp);
  const any = leadWhere(u, { ...sp, from: "", to: "" });
  const link = (extra: Record<string, string | number>) => `/leads?${filterQuery(sp, extra)}`;

  const [[l], [c], [f], all, stageRows, daily, [pending], [fc]] = await Promise.all([
    q(`SELECT COUNT(*) total, COALESCE(SUM(DATE(l.created_at)=CURDATE()),0) today, COALESCE(SUM(l.owner_id IS NOT NULL),0) assigned,
         COALESCE(SUM(l.owner_id IS NULL),0) unassigned, COALESCE(SUM(l.total_calls>0),0) contacted, COALESCE(SUM(s.name='Interested'),0) interested,
         COALESCE(SUM(${QUALIFIED_SQL}),0) qualified, COALESCE(SUM(s.is_won),0) converted, COALESCE(SUM(s.is_lost),0) lost
       FROM leads l JOIN stages s ON s.id=l.stage_id WHERE ${cohort.where}`, cohort.params),
    q(`SELECT COUNT(*) calls, COALESCE(SUM(c.duration_sec>0 OR c.disposition IN ('Connected','Interested','Call Back Requested','Follow-up Required','Converted','Not Interested')),0) connected
       FROM calls c JOIN leads l ON l.id=c.lead_id WHERE c.started_at BETWEEN ? AND ? + INTERVAL 1 DAY AND ${any.where}`, [from, to, ...any.params]),
    q(`SELECT COALESCE(SUM(f.due_at>=NOW()),0) pending, COALESCE(SUM(f.due_at<NOW()),0) overdue, COALESCE(SUM(DATE(f.due_at)=CURDATE()),0) today
       FROM followups f JOIN leads l ON l.id=f.lead_id WHERE f.status='pending' AND ${any.where}`, any.params),
    aggregate(u, sp, "all"),
    q(`SELECT s.id, s.name, s.color, COUNT(l.id) n FROM stages s LEFT JOIN leads l ON l.stage_id=s.id AND ${cohort.where} GROUP BY s.id ORDER BY s.position`, cohort.params),
    q(`SELECT DATE(l.created_at) d, COUNT(*) n FROM leads l WHERE ${cohort.where} GROUP BY d ORDER BY d`, cohort.params),
    q(`SELECT COALESCE(SUM(sa.order_value - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.sale_id=sa.id),0)),0) amt
       FROM sales sa JOIN leads l ON l.id=sa.lead_id WHERE sa.status IN ('Pending','Partially Paid') AND ${any.where}`, any.params),
    // Predictive: expected conversions/revenue from the open pipeline (win probability × expected value, else average order)
    q(`SELECT COALESCE(SUM(l.win_prob)/100,0) conv, COUNT(*) open_leads,
         COALESCE(SUM(l.win_prob/100 * COALESCE(l.expected_revenue, (SELECT AVG(order_value) FROM sales WHERE status NOT IN ('Cancelled','Refunded')), 0)),0) rev
       FROM leads l JOIN stages s ON s.id=l.stage_id WHERE s.is_won=0 AND s.is_lost=0 AND ${any.where}`, any.params),
  ]);
  const k = all[0] ?? { spend: 0, revenue: 0, collected: 0, cpl: null, cac: null, roas: null, roi: null, convRate: null, grossProfit: 0 };
  const maxDay = Math.max(1, ...daily.map((d) => Number(d.n)));
  const maxStage = Math.max(1, ...stageRows.map((s) => Number(s.n)));

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="h1">Dashboard</h1>
        <span className="text-sm text-slate-500">{from} → {to}</span>
      </div>
      <FilterBar sp={sp} fields={["date", "campaign", "source", "category", "city", "team", "owner", "stage"]} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Total leads" value={num(l.total)} href={link({})} />
        <Stat label="Today's leads" value={num(l.today)} />
        <Stat label="Assigned" value={num(l.assigned)} />
        <Stat label="Unassigned" value={num(l.unassigned)} href={link({ owner: "none" })} />
        <Stat label="Contacted leads" value={num(l.contacted)} />
        <Stat label="Calls made" value={num(c.calls)} sub={`${num(c.connected)} connected · ${num(Number(c.calls) - Number(c.connected))} not connected`} />
        <Stat label="Pending follow-ups" value={num(f.pending)} href="/followups?tab=upcoming" sub={`${num(f.today)} due today`} />
        <Stat label="Overdue follow-ups" value={<span className={Number(f.overdue) ? "text-red-600" : ""}>{num(f.overdue)}</span>} href="/followups?tab=overdue" />
        <Stat label="Interested" value={num(l.interested)} />
        <Stat label="Qualified" value={num(l.qualified)} />
        <Stat label="Converted" value={num(l.converted)} href={link({ conversion: "converted" })} />
        <Stat label="Lost" value={num(l.lost)} href={link({ conversion: "lost" })} />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Total sales (booked)" value={inr(k.revenue)} sub={`Gross profit ${inr(k.grossProfit)}`} />
        <Stat label="Collected revenue" value={inr(k.collected)} />
        <Stat label="Pending payments" value={inr(pending.amt)} href="/sales?status=open" />
        <Stat label="Marketing spend" value={inr(k.spend)} />
        <Stat label="Conversion rate" value={pct(k.convRate)} />
        <Stat label="CPL" value={inr(k.cpl)} />
        <Stat label="CAC" value={inr(k.cac)} />
        <Stat label="ROAS" value={ratio(k.roas)} />
        <Stat label="Marketing ROI" value={pct(k.roi)} sub="on gross profit" />
        <Stat label="Predicted conversions" value={num(Math.round(Number(fc.conv)))} sub={`from ${num(fc.open_leads)} open leads`} href="/reports?report=forecast" />
        <Stat label="Forecast revenue" value={inr(Number(fc.rev))} sub="win probability × expected value" href="/reports?report=forecast" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="h2">Leads per day</h2>
          <div className="flex h-40 items-end gap-0.5">
            {daily.map((d) => (
              <Link key={d.d} href={link({ from: d.d, to: d.d })} title={`${d.d}: ${d.n}`} aria-label={`${d.d}: ${d.n} leads`}
                className="flex-1 rounded-t bg-indigo-400 hover:bg-indigo-600" style={{ height: `${(Number(d.n) / maxDay) * 100}%` }} />
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="h2">Pipeline by stage</h2>
          <div className="space-y-1">
            {stageRows.map((s) => (
              <Link key={s.id} href={link({ stage: s.id })} className="flex items-center gap-2 text-xs hover:bg-slate-50">
                <span className="w-44 truncate text-slate-600">{s.name}</span>
                <span className="h-3 rounded" style={{ width: `${(Number(s.n) / maxStage) * 60}%`, background: s.color }} />
                <span className="tabular-nums">{s.n}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
