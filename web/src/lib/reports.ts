import type { User } from "./auth";
import { q } from "./db";
import { leadWhere, str, type SP } from "./filters";
import { cac, conversionRate, cpl, roas, roi } from "./metrics";

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export function dateRange(sp: SP) {
  const to = str(sp.to) || iso(new Date());
  const from = str(sp.from) || iso(new Date(Date.now() - 29 * 864e5));
  return { from, to };
}
/** searchParams with the default date range filled in. */
export const withRange = (sp: SP): SP => ({ ...sp, ...dateRange(sp) });

// "Qualified" = a stage at/after the first is_qualified stage and up to Won, or Won itself.
export const QUALIFIED_SQL = `(s.is_won=1 OR (s.is_lost=0 AND s.position >= (SELECT COALESCE(MIN(position),999) FROM stages WHERE is_qualified=1)
  AND s.position <= (SELECT COALESCE(MAX(position),0) FROM stages WHERE is_won=1)))`;

export type Dim = "all" | "campaign" | "channel" | "source" | "category" | "employee" | "team" | "adset" | "ad" | "city";
const DIM: Record<Dim, { key: string; label: string; join?: string }> = {
  all: { key: "'all'", label: "'All'" },
  campaign: { key: "COALESCE(l.campaign_id,0)", label: "COALESCE(c.name, l.campaign_name, '(no campaign)')", join: "LEFT JOIN campaigns c ON c.id=l.campaign_id" },
  channel: { key: "COALESCE(l.channel,'(none)')", label: "COALESCE(l.channel,'(none)')" },
  source: { key: "l.source", label: "l.source" },
  category: { key: "COALESCE(l.category,'(none)')", label: "COALESCE(l.category,'(none)')" },
  city: { key: "COALESCE(l.city,'(none)')", label: "COALESCE(l.city,'(none)')" },
  employee: { key: "COALESCE(l.owner_id,0)", label: "COALESCE(ou.name,'(unassigned)')", join: "LEFT JOIN users ou ON ou.id=l.owner_id" },
  team: { key: "COALESCE(ou.team_id,0)", label: "COALESCE(tt.name,'(no team)')", join: "LEFT JOIN users ou ON ou.id=l.owner_id LEFT JOIN teams tt ON tt.id=ou.team_id" },
  adset: { key: "COALESCE(l.adset_name,'(none)')", label: "COALESCE(l.adset_name,'(none)')" },
  ad: { key: "COALESCE(l.ad_name,'(none)')", label: "COALESCE(l.ad_name,'(none)')" },
};
const SPEND_DIMS: Dim[] = ["all", "campaign", "channel", "adset", "ad"];

export type AggRow = {
  key: string; label: string; leads: number; contacted: number; qualified: number; converted: number; lost: number;
  revenue: number; grossProfit: number; customers: number; collected: number; spend: number | null;
  cpl: number | null; cac: number | null; roas: number | null; roi: number | null; convRate: number | null;
};

/**
 * Leads are counted by creation date (cohort); sales, payments and spend by their own dates in the range.
 * Revenue is attributed once per sale, to the campaign stored on the sale (first or last touch, per the attribution setting).
 * Spend rows carry campaign and, when synced from Meta, ad set + ad — so spend ratios exist for all / campaign / channel / ad set / ad.
 */
export async function aggregate(u: User, sp0: SP, dim: Dim): Promise<AggRow[]> {
  const sp = withRange(sp0);
  const { from, to } = dateRange(sp);
  const d = DIM[dim];
  const cohort = leadWhere(u, sp);
  const anyDate = leadWhere(u, { ...sp, from: "", to: "" });

  const leads = await q(
    `SELECT ${d.key} k, ${d.label} label, COUNT(*) leads, SUM(l.total_calls>0) contacted, SUM(${QUALIFIED_SQL}) qualified,
       SUM(s.is_won) converted, SUM(s.is_lost) lost
     FROM leads l JOIN stages s ON s.id=l.stage_id ${d.join ?? ""} WHERE ${cohort.where} GROUP BY k, label`, cohort.params);

  const isCamp = dim === "campaign";
  const saleKey = isCamp ? "COALESCE(sa.campaign_id,0)" : d.key;
  const saleLabel = isCamp ? "COALESCE(c.name,'(no campaign)')" : d.label;
  const saleJoin = isCamp ? "LEFT JOIN campaigns c ON c.id=sa.campaign_id" : d.join ?? "";
  const sales = await q(
    `SELECT ${saleKey} k, ${saleLabel} label, SUM(sa.order_value) revenue, SUM(sa.gross_profit) gp, COUNT(DISTINCT sa.lead_id) customers
     FROM sales sa JOIN leads l ON l.id=sa.lead_id ${saleJoin}
     WHERE sa.status NOT IN ('Cancelled','Refunded') AND sa.sale_date BETWEEN ? AND ? AND ${anyDate.where} GROUP BY k, label`,
    [from, to, ...anyDate.params]);
  const collected = await q(
    `SELECT ${saleKey} k, SUM(p.amount) amt FROM payments p JOIN sales sa ON sa.id=p.sale_id JOIN leads l ON l.id=sa.lead_id ${saleJoin}
     WHERE p.paid_at BETWEEN ? AND ? AND ${anyDate.where} GROUP BY k`, [from, to, ...anyDate.params]);

  let spend: { k: string; label: string; amt: number }[] = [];
  if (SPEND_DIMS.includes(dim)) {
    const cf = str(sp.campaign) ? " AND c.id=" + Number(str(sp.campaign)) : "";
    const k = isCamp ? "c.id" : dim === "channel" ? "c.channel" : dim === "adset" ? "COALESCE(e.adset_name,'(none)')" : dim === "ad" ? "COALESCE(e.ad_name,'(none)')" : "'all'";
    const label = isCamp ? "c.name" : dim === "channel" ? "c.channel" : dim === "adset" || dim === "ad" ? k : "'All'";
    spend = await q(`SELECT ${k} k, ${label} label, SUM(e.amount) amt FROM spend_entries e JOIN campaigns c ON c.id=e.campaign_id
      WHERE e.spend_date BETWEEN ? AND ?${cf} GROUP BY k, label`, [from, to]);
  }

  const map = new Map<string, AggRow>();
  const row = (k: unknown, label: string) => {
    const key = String(k);
    if (!map.has(key)) map.set(key, {
      key, label, leads: 0, contacted: 0, qualified: 0, converted: 0, lost: 0, revenue: 0, grossProfit: 0, customers: 0, collected: 0,
      spend: SPEND_DIMS.includes(dim) ? 0 : null, cpl: null, cac: null, roas: null, roi: null, convRate: null,
    });
    return map.get(key)!;
  };
  for (const r of leads) Object.assign(row(r.k, r.label), { leads: +r.leads, contacted: +r.contacted, qualified: +r.qualified, converted: +r.converted, lost: +r.lost });
  for (const r of sales) Object.assign(row(r.k, r.label), { revenue: +r.revenue, grossProfit: +r.gp, customers: +r.customers });
  for (const r of collected) if (map.has(String(r.k))) map.get(String(r.k))!.collected = +r.amt;
  for (const r of spend) row(r.k, r.label).spend = +r.amt;

  for (const r of map.values()) {
    r.convRate = conversionRate(r.converted, r.leads);
    if (r.spend != null) {
      r.cpl = cpl(r.spend, r.leads); r.cac = cac(r.spend, r.customers); r.roas = roas(r.revenue, r.spend); r.roi = roi(r.grossProfit, r.spend);
    }
  }
  return [...map.values()].sort((a, b) => b.leads - a.leads || b.revenue - a.revenue);
}

// ---------------- Reports & MIS (SRS §14) ----------------
export type Fmt = "int" | "inr" | "pct" | "ratio" | "dur" | "text";
export type Col = { key: string; label: string; fmt?: Fmt };
export type Report = { title: string; columns: Col[]; rows: Record<string, unknown>[]; drill?: (r: Record<string, unknown>) => Record<string, string> | null };

const AGG_COLS: Col[] = [
  { key: "label", label: "Name" }, { key: "spend", label: "Spend", fmt: "inr" }, { key: "leads", label: "Leads", fmt: "int" },
  { key: "qualified", label: "Qualified", fmt: "int" }, { key: "converted", label: "Converted", fmt: "int" },
  { key: "convRate", label: "Conv %", fmt: "pct" }, { key: "revenue", label: "Revenue", fmt: "inr" }, { key: "grossProfit", label: "Gross profit", fmt: "inr" },
  { key: "cpl", label: "CPL", fmt: "inr" }, { key: "cac", label: "CAC", fmt: "inr" }, { key: "roas", label: "ROAS", fmt: "ratio" }, { key: "roi", label: "ROI", fmt: "pct" },
];
const SPEND_COLS = ["spend", "cpl", "cac", "roas", "roi"];
const DRILL_KEY: Partial<Record<Dim, string>> = { campaign: "campaign", source: "source", category: "category", employee: "owner", team: "team", city: "city" };

async function aggReport(u: User, sp: SP, dim: Dim, title: string): Promise<Report> {
  const rows = await aggregate(u, sp, dim);
  const dk = DRILL_KEY[dim];
  return {
    title, rows: rows as unknown as Record<string, unknown>[],
    columns: SPEND_DIMS.includes(dim) ? AGG_COLS : AGG_COLS.filter((c) => !SPEND_COLS.includes(c.key)),
    drill: dk ? (r) => (r.key === "0" ? (dk === "owner" ? { owner: "none" } : null) : { [dk]: String(r.key) }) : undefined,
  };
}

export const REPORTS: Record<string, { title: string; run: (u: User, sp: SP) => Promise<Report> }> = {
  lead_generation: {
    title: "Lead generation (daily / weekly / monthly)",
    async run(u, sp) {
      const g = ["week", "month"].includes(str(sp.group)) ? str(sp.group) : "day";
      const expr = g === "month" ? "DATE_FORMAT(l.created_at,'%Y-%m')" : g === "week" ? "DATE_FORMAT(l.created_at,'%x-W%v')" : "DATE(l.created_at)";
      const w = leadWhere(u, withRange(sp));
      const rows = await q(`SELECT ${expr} period, COUNT(*) leads, SUM(l.total_calls>0) contacted, SUM(s.is_won) converted, SUM(s.is_lost) lost
        FROM leads l JOIN stages s ON s.id=l.stage_id WHERE ${w.where} GROUP BY period ORDER BY period DESC`, w.params);
      return {
        title: `Lead generation by ${g}`, rows,
        columns: [{ key: "period", label: "Period" }, { key: "leads", label: "Leads", fmt: "int" }, { key: "contacted", label: "Contacted", fmt: "int" },
          { key: "converted", label: "Converted", fmt: "int" }, { key: "lost", label: "Lost", fmt: "int" }],
        drill: g === "day" ? (r) => ({ from: String(r.period), to: String(r.period) }) : undefined,
      };
    },
  },
  source: { title: "Source-wise leads", run: (u, sp) => aggReport(u, sp, "source", "Source-wise performance") },
  campaign: { title: "Campaign-wise leads & ROI", run: (u, sp) => aggReport(u, sp, "campaign", "Campaign-wise performance") },
  channel: { title: "Channel ROI", run: (u, sp) => aggReport(u, sp, "channel", "Channel performance") },
  adset: { title: "Ad set / ad comparison", run: (u, sp) => aggReport(u, sp, str(sp.level) === "ad" ? "ad" : "adset", "Ad set / ad performance") },
  category: { title: "Category / vertical-wise", run: (u, sp) => aggReport(u, sp, "category", "Category performance") },
  city: { title: "City-wise", run: (u, sp) => aggReport(u, sp, "city", "City performance") },
  employee: {
    title: "Employee calling performance",
    async run(u, sp) {
      const { from, to } = dateRange(sp);
      const teamF = str(sp.team) ? " AND us.team_id=" + Number(str(sp.team)) : "";
      const rows = await q(
        `SELECT us.id, us.name, t.name team, us.target_calls, us.target_conversions,
           (SELECT COUNT(*) FROM leads l WHERE l.owner_id=us.id AND l.assigned_at BETWEEN ? AND ? + INTERVAL 1 DAY) assigned,
           COUNT(c.id) calls,
           COALESCE(SUM(c.disposition IN ('Connected','Interested','Call Back Requested','Follow-up Required','Converted','Not Interested')),0) connected,
           COALESCE(SUM(c.duration_sec),0) talk, COUNT(DISTINCT c.lead_id) unique_leads, COALESCE(SUM(c.disposition='Interested'),0) interested,
           (SELECT COUNT(*) FROM followups f WHERE f.assigned_to=us.id AND f.status='done' AND f.completed_at BETWEEN ? AND ? + INTERVAL 1 DAY) fu_done,
           (SELECT COUNT(*) FROM followups f WHERE f.assigned_to=us.id AND f.status='pending' AND f.due_at<NOW()) fu_overdue,
           (SELECT COUNT(*) FROM sales sa WHERE sa.user_id=us.id AND sa.status NOT IN ('Cancelled','Refunded') AND sa.sale_date BETWEEN ? AND ?) conversions,
           (SELECT COALESCE(SUM(order_value),0) FROM sales sa WHERE sa.user_id=us.id AND sa.status NOT IN ('Cancelled','Refunded') AND sa.sale_date BETWEEN ? AND ?) revenue
         FROM users us LEFT JOIN teams t ON t.id=us.team_id
         LEFT JOIN calls c ON c.user_id=us.id AND c.started_at BETWEEN ? AND ? + INTERVAL 1 DAY
         WHERE us.role IN ('calling_executive','sales_executive','team_leader') AND us.active=1${teamF}
           ${u.role === "team_leader" ? "AND us.team_id=" + Number(u.team_id ?? -1) : ["calling_executive", "sales_executive"].includes(u.role) ? "AND us.id=" + u.id : ""}
         GROUP BY us.id ORDER BY calls DESC`,
        [from, to, from, to, from, to, from, to, from, to]);
      return {
        title: "Employee calling & conversion performance", rows,
        columns: [{ key: "name", label: "Employee" }, { key: "team", label: "Team" }, { key: "assigned", label: "Assigned", fmt: "int" },
          { key: "calls", label: "Calls", fmt: "int" }, { key: "connected", label: "Connected", fmt: "int" }, { key: "talk", label: "Talk time", fmt: "dur" },
          { key: "unique_leads", label: "Leads called", fmt: "int" }, { key: "interested", label: "Interested", fmt: "int" },
          { key: "fu_done", label: "Follow-ups done", fmt: "int" }, { key: "fu_overdue", label: "Overdue now", fmt: "int" },
          { key: "conversions", label: "Sales", fmt: "int" }, { key: "revenue", label: "Revenue", fmt: "inr" }],
        drill: (r) => ({ owner: String(r.id) }),
      };
    },
  },
  team: { title: "Team performance", run: (u, sp) => aggReport(u, sp, "team", "Team performance") },
  followups: {
    title: "Follow-up pending & overdue",
    async run(u, sp) {
      const w = leadWhere(u, { ...sp, from: "", to: "" });
      const rows = await q(
        `SELECT us.id, COALESCE(us.name,'(unassigned)') name,
           SUM(f.status='pending' AND f.due_at<NOW()) overdue, SUM(f.status='pending' AND DATE(f.due_at)=CURDATE() AND f.due_at>=NOW()) today,
           SUM(f.status='pending' AND DATE(f.due_at)>CURDATE()) upcoming, SUM(f.status='done') done, SUM(f.escalated) escalated,
           SUM(f.status='done' AND f.completed_at>f.due_at + INTERVAL 1 HOUR) done_late
         FROM followups f JOIN leads l ON l.id=f.lead_id LEFT JOIN users us ON us.id=f.assigned_to
         WHERE ${w.where} GROUP BY us.id, us.name ORDER BY overdue DESC`, w.params);
      return {
        title: "Follow-ups by employee", rows,
        columns: [{ key: "name", label: "Employee" }, { key: "overdue", label: "Overdue", fmt: "int" }, { key: "today", label: "Due today", fmt: "int" },
          { key: "upcoming", label: "Upcoming", fmt: "int" }, { key: "done", label: "Done", fmt: "int" }, { key: "done_late", label: "Done late", fmt: "int" },
          { key: "escalated", label: "Escalated", fmt: "int" }],
        drill: (r) => (r.id ? { owner: String(r.id) } : null),
      };
    },
  },
  funnel: {
    title: "Sales funnel & time in stage",
    async run(u, sp) {
      const w = leadWhere(u, withRange(sp));
      const { from, to } = dateRange(sp);
      const rows = await q(
        `SELECT s.id, s.name, s.position,
           (SELECT COUNT(*) FROM leads l WHERE l.stage_id=s.id AND ${w.where}) current_count,
           (SELECT COUNT(DISTINCT h.lead_id) FROM stage_history h WHERE h.to_stage_id=s.id AND h.changed_at BETWEEN ? AND ? + INTERVAL 1 DAY) entered,
           (SELECT AVG(h.seconds_in_prev) FROM stage_history h WHERE h.from_stage_id=s.id) avg_time
         FROM stages s ORDER BY s.position`, [...w.params, from, to]);
      return {
        title: "Funnel: leads per stage (created in period), stage entries in period, average time spent in stage", rows,
        columns: [{ key: "name", label: "Stage" }, { key: "current_count", label: "Leads now", fmt: "int" }, { key: "entered", label: "Entered in period", fmt: "int" },
          { key: "avg_time", label: "Avg time in stage", fmt: "dur" }],
        drill: (r) => ({ stage: String(r.id) }),
      };
    },
  },
  ageing: {
    title: "Lead ageing (open leads)",
    async run(u, sp) {
      const w = leadWhere(u, { ...sp, from: "", to: "", conversion: "open" });
      const rows = await q(
        `SELECT CASE WHEN d<=1 THEN '0–1 days' WHEN d<=3 THEN '2–3 days' WHEN d<=7 THEN '4–7 days' WHEN d<=15 THEN '8–15 days' WHEN d<=30 THEN '16–30 days' ELSE '30+ days' END bucket,
           MIN(d) mind, MAX(d) maxd, COUNT(*) leads, SUM(total_calls=0) never_called, SUM(next_followup_at IS NULL) no_followup
         FROM (SELECT l.total_calls, l.next_followup_at, DATEDIFF(NOW(), l.created_at) d FROM leads l WHERE ${w.where}) x GROUP BY bucket ORDER BY MIN(d)`, w.params);
      const day = (days: number) => iso(new Date(Date.now() - days * 864e5));
      return {
        title: "Open lead ageing", rows,
        columns: [{ key: "bucket", label: "Age" }, { key: "leads", label: "Open leads", fmt: "int" }, { key: "never_called", label: "Never called", fmt: "int" },
          { key: "no_followup", label: "No follow-up set", fmt: "int" }],
        drill: (r) => ({ conversion: "open", from: day(Number(r.maxd)), to: day(Number(r.mind)) }),
      };
    },
  },
  lost: {
    title: "Lost leads & reasons",
    async run(u, sp) {
      const w = leadWhere(u, { ...withRange(sp), conversion: "lost" });
      const rows = await q(`SELECT COALESCE(l.lost_reason,'(not given)') reason, COUNT(*) leads FROM leads l WHERE ${w.where} GROUP BY reason ORDER BY leads DESC`, w.params);
      const total = rows.reduce((a, r) => a + Number(r.leads), 0);
      rows.forEach((r) => (r.share = total ? (Number(r.leads) / total) * 100 : null));
      return { title: "Lost reasons", rows, columns: [{ key: "reason", label: "Reason" }, { key: "leads", label: "Leads", fmt: "int" }, { key: "share", label: "Share", fmt: "pct" }] };
    },
  },
  revenue: {
    title: "Revenue & payment collection",
    async run(u, sp) {
      const { from, to } = dateRange(sp);
      const w = leadWhere(u, { ...sp, from: "", to: "" });
      const sales = await q(
        `SELECT DATE_FORMAT(sa.sale_date,'%Y-%m') period, SUM(sa.order_value) booked, SUM(sa.gross_profit) gp FROM sales sa JOIN leads l ON l.id=sa.lead_id
         WHERE sa.status NOT IN ('Cancelled','Refunded') AND sa.sale_date BETWEEN ? AND ? AND ${w.where} GROUP BY period`, [from, to, ...w.params]);
      const pays = await q(
        `SELECT DATE_FORMAT(p.paid_at,'%Y-%m') period, SUM(GREATEST(p.amount,0)) collected, -SUM(LEAST(p.amount,0)) refunded
         FROM payments p JOIN sales sa ON sa.id=p.sale_id JOIN leads l ON l.id=sa.lead_id
         WHERE p.paid_at BETWEEN ? AND ? AND ${w.where} GROUP BY period`, [from, to, ...w.params]);
      const m = new Map<string, Record<string, unknown>>();
      const get = (p: string) => m.get(p) ?? (m.set(p, { period: p, booked: 0, gp: 0, collected: 0, refunded: 0 }), m.get(p)!);
      for (const r of sales) Object.assign(get(r.period), { booked: r.booked, gp: r.gp });
      for (const r of pays) Object.assign(get(r.period), { collected: r.collected, refunded: r.refunded });
      const rows = [...m.values()].sort((a, b) => String(b.period).localeCompare(String(a.period)));
      const pending = await q(
        `SELECT COALESCE(SUM(sa.order_value - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.sale_id=sa.id),0)),0) p
         FROM sales sa JOIN leads l ON l.id=sa.lead_id WHERE sa.status IN ('Pending','Partially Paid') AND ${w.where}`, w.params);
      rows.push({ period: "Outstanding now (all periods)", booked: null, gp: null, collected: null, refunded: null, pending: pending[0].p });
      return {
        title: "Booked sales vs cash collected (by month)", rows,
        columns: [{ key: "period", label: "Month" }, { key: "booked", label: "Booked sales", fmt: "inr" }, { key: "gp", label: "Gross profit", fmt: "inr" },
          { key: "collected", label: "Collected", fmt: "inr" }, { key: "refunded", label: "Refunded", fmt: "inr" }, { key: "pending", label: "Pending", fmt: "inr" }],
      };
    },
  },
  calls: {
    title: "Call analytics (agent / hour / outcome)",
    async run(u, sp) {
      const { from, to } = dateRange(sp);
      const w = leadWhere(u, { ...sp, from: "", to: "" });
      const g = ["hour", "disposition"].includes(str(sp.group)) ? str(sp.group) : "agent";
      const key = g === "hour" ? "LPAD(HOUR(c.started_at),2,'0')" : g === "disposition" ? "c.disposition" : "COALESCE(us.name,'(unknown)')";
      const rows = await q(
        `SELECT ${key} k, COUNT(*) calls, COUNT(DISTINCT c.lead_id) leads,
           SUM(c.disposition IN ('Connected','Interested','Call Back Requested','Follow-up Required','Converted','Not Interested')) connected,
           SUM(c.disposition='Interested') interested, SUM(c.disposition='Converted') converted,
           SUM(c.duration_sec) talk, ROUND(AVG(NULLIF(c.duration_sec,0))) avg_talk, SUM(c.recording_url IS NOT NULL) recorded
         FROM calls c JOIN leads l ON l.id=c.lead_id LEFT JOIN users us ON us.id=c.user_id
         WHERE c.started_at BETWEEN ? AND ? + INTERVAL 1 DAY AND ${w.where} GROUP BY k ORDER BY ${g === "agent" ? "calls DESC" : "k"}`, [from, to, ...w.params]);
      for (const r of rows) r.connect_rate = r.calls ? (100 * Number(r.connected)) / Number(r.calls) : null;
      return {
        title: `Calls by ${g}`, rows,
        columns: [{ key: "k", label: g === "hour" ? "Hour" : g === "disposition" ? "Outcome" : "Agent" }, { key: "calls", label: "Calls", fmt: "int" },
          { key: "leads", label: "Leads called", fmt: "int" }, { key: "connected", label: "Connected", fmt: "int" }, { key: "connect_rate", label: "Connect %", fmt: "pct" },
          { key: "interested", label: "Interested", fmt: "int" }, { key: "converted", label: "Converted", fmt: "int" }, { key: "talk", label: "Talk time", fmt: "dur" },
          { key: "avg_talk", label: "Avg talk", fmt: "dur" }, { key: "recorded", label: "Recorded", fmt: "int" }],
      };
    },
  },
  forecast: {
    title: "Pipeline forecast (predicted conversions)",
    async run(u, sp) {
      const w = leadWhere(u, { ...sp, from: "", to: "" });
      const g = ["source", "owner", "category"].includes(str(sp.group)) ? str(sp.group) : "stage";
      const key = g === "source" ? "l.source" : g === "owner" ? "COALESCE(ou.name,'(unassigned)')" : g === "category" ? "COALESCE(l.category,'(none)')" : "s.name";
      const rows = await q(
        `SELECT ${key} k, ${g === "stage" ? "s.id" : "NULL"} sid, ${g === "stage" ? "MIN(s.position)" : "0"} pos, COUNT(*) open_leads, AVG(l.win_prob) avg_prob,
           SUM(l.win_prob)/100 predicted, SUM(l.win_prob/100 * COALESCE(l.expected_revenue, (SELECT AVG(order_value) FROM sales WHERE status NOT IN ('Cancelled','Refunded')), 0)) forecast,
           AVG(l.score) avg_score
         FROM leads l JOIN stages s ON s.id=l.stage_id LEFT JOIN users ou ON ou.id=l.owner_id
         WHERE s.is_won=0 AND s.is_lost=0 AND ${w.where} GROUP BY k${g === "stage" ? ", s.id" : ""} ORDER BY ${g === "stage" ? "pos" : "predicted DESC"}`, w.params);
      return {
        title: `Forecast by ${g} — from historical conversion rates (Settings → Data)`, rows,
        columns: [{ key: "k", label: g[0].toUpperCase() + g.slice(1) }, { key: "open_leads", label: "Open leads", fmt: "int" },
          { key: "avg_prob", label: "Avg win %", fmt: "pct" }, { key: "predicted", label: "Predicted conversions", fmt: "int" },
          { key: "forecast", label: "Forecast revenue", fmt: "inr" }, { key: "avg_score", label: "Avg score", fmt: "int" }],
        drill: g === "stage" ? (r) => ({ stage: String(r.sid) }) : g === "source" ? (r) => ({ source: String(r.k) }) : undefined,
      };
    },
  },
};
