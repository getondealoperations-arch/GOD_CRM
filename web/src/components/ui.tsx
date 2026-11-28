import Link from "next/link";
import type { ReactNode } from "react";

export const fmtDate = (d?: string | null) => (d ? new Date(d.replace(" ", "T")).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
export const fmtDay = (d?: string | null) => (d ? new Date(d.slice(0, 10) + "T00:00").toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—");
export const num = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("en-IN"));
export const dur = (sec: number) => (sec >= 86400 ? `${(sec / 86400).toFixed(1)}d` : sec >= 3600 ? `${(sec / 3600).toFixed(1)}h` : `${Math.round(sec / 60)}m`);
/** datetime-local value from a Date */
export const dtLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
export const tomorrowLocal = () => dtLocal(new Date(Date.now() + 864e5));
export const secondsSince = (iso: string) => Math.round((Date.now() - Date.parse(iso)) / 1000);

export function Stat({ label, value, href, sub }: { label: string; value: ReactNode; href?: string; sub?: ReactNode }) {
  const body = (
    <>
      <div className="text-[13px] text-slate-500">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold leading-none tracking-tight tabular-nums text-slate-900">{value}</div>
      {sub && <div className="mt-1.5 text-xs leading-snug text-slate-500">{sub}</div>}
    </>
  );
  return href
    ? <Link href={href} className="card block p-3.5 transition-colors hover:border-indigo-400 hover:bg-indigo-50/40">{body}</Link>
    : <div className="card p-3.5">{body}</div>;
}

export function StageBadge({ name, color }: { name: string; color?: string }) {
  return <span className="badge" style={{ background: (color ?? "#64748b") + "22", color: color ?? "#334155" }}>{name}</span>;
}

const PRIO: Record<string, string> = { hot: "bg-red-100 text-red-700", high: "bg-orange-100 text-orange-700", medium: "bg-slate-100 text-slate-700", low: "bg-slate-50 text-slate-500" };
export const PriorityBadge = ({ p }: { p: string }) => <span className={`badge ${PRIO[p] ?? "bg-slate-100 text-slate-700"}`}>{p}</span>;

export function Pager({ page, total, perPage, query }: { page: number; total: number; perPage: number; query: string }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const href = (p: number) => `?${query}${query ? "&" : ""}page=${p}`;
  return (
    <div className="flex items-center justify-between text-sm text-slate-600">
      <span>{num(total)} records, page {page} of {pages}</span>
      <div className="flex gap-2">
        {page > 1 && <Link className="btn-ghost" href={href(page - 1)}>Previous</Link>}
        {page < pages && <Link className="btn-ghost" href={href(page + 1)}>Next</Link>}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-sm p-8 text-center text-sm leading-relaxed text-slate-500">{children}</div>;
}
