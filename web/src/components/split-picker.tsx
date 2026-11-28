"use client";
import { useState } from "react";

export type Emp = { id: number; name: string; role: string; team: string | null; open_leads: number };

/** Pick the employees who share a pool of leads; shows the split before anything is assigned. */
export function SplitPicker({ emps, pool }: { emps: Emp[]; pool: number }) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [limit, setLimit] = useState("");
  const all = emps.length > 0 && sel.size === emps.length;
  // The server hands out at most `limit` leads (default and maximum 500); the preview must say the same.
  const n = Math.min(pool, Math.min(500, Number(limit) > 0 ? Number(limit) : 500));
  const lo = sel.size ? Math.floor(n / sel.size) : 0;
  const hi = sel.size ? Math.ceil(n / sel.size) : 0;

  return (
    <div className="space-y-3">
      <div className="max-w-xs">
        <label className="label" htmlFor="limit">Most leads to hand out (optional, up to 500)</label>
        <input id="limit" name="limit" type="number" min={1} max={500} placeholder="All of them" className="input" value={limit} onChange={(e) => setLimit(e.target.value)} />
      </div>
      <div className="flex items-center justify-between">
        <h2 className="h2 mb-0">Who gets the leads</h2>
        <button type="button" className="link text-sm" onClick={() => setSel(all ? new Set() : new Set(emps.map((e) => e.id)))}>{all ? "Clear all" : "Select all"}</button>
      </div>
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {emps.map((e) => (
          <li key={e.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
              <input type="checkbox" name="emp" value={e.id} checked={sel.has(e.id)} onChange={() => toggle(e.id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{e.name}</span>
                <span className="block truncate text-xs text-slate-500">{e.role}{e.team ? ` · ${e.team}` : ""}</span>
              </span>
              <span className="text-xs tabular-nums text-slate-500">{e.open_leads} open</span>
            </label>
          </li>
        ))}
        {!emps.length && <li className="p-4 text-center text-sm text-slate-500">No one is available right now. Employees marked unavailable are skipped.</li>}
      </ul>
      <p aria-live="polite" className="text-sm text-slate-600">
        {!pool ? "There are no unassigned leads for these filters."
          : sel.size ? `${n} lead${n === 1 ? "" : "s"} across ${sel.size} ${sel.size === 1 ? "person" : "people"}: ${lo === hi ? lo : `${lo} to ${hi}`} each.${n < pool ? ` The other ${pool - n} stay unassigned.` : ""}`
          : "Pick at least one employee to see the split."}
      </p>
      <button className="btn" disabled={!sel.size || !pool}>Split and assign</button>
    </div>
  );
}
