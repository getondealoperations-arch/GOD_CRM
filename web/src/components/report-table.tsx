import Link from "next/link";
import { filterQuery, type SP } from "@/lib/filters";
import { inr, pct, ratio } from "@/lib/metrics";
import type { Report } from "@/lib/reports";
import { dur, num } from "./ui";

export function cell(v: unknown, fmt?: string) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  switch (fmt) {
    case "int": return num(n);
    case "inr": return inr(n);
    case "pct": return pct(n);
    case "ratio": return ratio(n);
    case "dur": return dur(n);
    default: return String(v);
  }
}

export function ReportTable({ report, sp }: { report: Report; sp: SP }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="tbl">
        <thead><tr>{report.columns.map((c) => <th key={c.key} className={c.fmt && c.fmt !== "text" ? "text-right" : ""}>{c.label}</th>)}</tr></thead>
        <tbody>
          {report.rows.map((r, i) => {
            const d = report.drill?.(r);
            return (
              <tr key={i}>
                {report.columns.map((c, j) => (
                  <td key={c.key} className={c.fmt && c.fmt !== "text" ? "text-right tabular-nums" : ""}>
                    {j === 0 && d ? <Link className="link" href={`/leads?${filterQuery({ ...sp, ...d })}`}>{cell(r[c.key], c.fmt)}</Link> : cell(r[c.key], c.fmt)}
                  </td>
                ))}
              </tr>
            );
          })}
          {!report.rows.length && <tr><td colSpan={report.columns.length} className="p-6 text-center text-slate-500">No data for these filters.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
