import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { leadWhere, str, type SP } from "@/lib/filters";
import { PAYMENT_STATUSES } from "@/lib/leads";
import { inr } from "@/lib/metrics";
import { dateRange } from "@/lib/reports";
import { fmtDay, Stat } from "@/components/ui";

export default async function Sales({ searchParams }: PageProps<"/sales">) {
  const u = await requireUser();
  const sp = (await searchParams) as SP;
  const { from, to } = dateRange(sp);
  const w = leadWhere(u, { ...sp, from: "", to: "" });
  const status = str(sp.status);
  if (status && status !== "open" && !PAYMENT_STATUSES.includes(status as never)) throw new Error("Unknown status");
  const statusSql = status === "open" ? " AND sa.status IN ('Pending','Partially Paid')" : status ? " AND sa.status=?" : "";
  const dateSql = status === "open" ? "" : " AND sa.sale_date BETWEEN ? AND ?";
  const params = [...w.params, ...(status === "open" ? [] : [from, to]), ...(status && status !== "open" ? [status] : [])];

  const rows = await q(
    `SELECT sa.*, l.name lead, l.lead_code, l.source, c.name campaign, us.name exec,
       COALESCE((SELECT SUM(amount) FROM payments p WHERE p.sale_id=sa.id),0) paid
     FROM sales sa JOIN leads l ON l.id=sa.lead_id LEFT JOIN campaigns c ON c.id=sa.campaign_id LEFT JOIN users us ON us.id=sa.user_id
     WHERE ${w.where}${dateSql}${statusSql} ORDER BY sa.sale_date DESC, sa.id DESC LIMIT 500`, params);
  const live = rows.filter((r) => r.status !== "Cancelled" && r.status !== "Refunded");
  const booked = live.reduce((a, r) => a + Number(r.order_value), 0);
  const collected = rows.reduce((a, r) => a + Number(r.paid), 0);
  const pending = live.reduce((a, r) => a + Math.max(0, Number(r.order_value) - Number(r.paid)), 0);

  return (
    <>
      <h1 className="h1">Sales & payments</h1>
      <form className="card flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="from">From</label><input id="from" type="date" name="from" defaultValue={from} className="input" /></div>
        <div><label className="label" htmlFor="to">To</label><input id="to" type="date" name="to" defaultValue={to} className="input" /></div>
        <div><label className="label" htmlFor="status">Payment status</label>
          <select id="status" name="status" defaultValue={status} className="input"><option value="">All</option><option value="open">Pending / partially paid (all dates)</option>
            {PAYMENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <button className="btn">Apply</button>
      </form>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sales" value={live.length} />
        <Stat label="Booked value" value={inr(booked)} />
        <Stat label="Cash collected (on these sales)" value={inr(collected)} />
        <Stat label="Pending" value={inr(pending)} />
      </section>
      <div className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead><tr><th>Date</th><th>Lead</th><th>Product</th><th>Invoice</th><th>Executive</th><th>Campaign / source</th>
            <th className="text-right">Order</th><th className="text-right">Paid</th><th className="text-right">Pending</th><th className="text-right">GP</th><th>Status</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">{fmtDay(r.sale_date)}</td>
              <td><Link className="link" href={`/leads/${r.lead_id}`}>{r.lead}</Link><div className="text-xs text-slate-400">{r.lead_code}</div></td>
              <td>{r.product}</td><td>{r.invoice_no ?? "—"}</td><td>{r.exec ?? "—"}</td>
              <td>{r.campaign ?? "—"}<div className="text-xs text-slate-400">{r.source}</div></td>
              <td className="text-right tabular-nums">{inr(r.order_value)}</td><td className="text-right tabular-nums">{inr(r.paid)}</td>
              <td className="text-right tabular-nums">{inr(Math.max(0, r.order_value - r.paid))}</td><td className="text-right tabular-nums">{inr(r.gross_profit)}</td>
              <td><span className={`badge ${r.status === "Paid" ? "bg-green-100 text-green-700" : r.status === "Partially Paid" ? "bg-amber-100 text-amber-800" : r.status === "Pending" ? "bg-slate-100" : "bg-red-100 text-red-700"}`}>{r.status}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Record sales and payments from the lead page. Booked value counts orders; collected counts actual payments received.</p>
    </>
  );
}
