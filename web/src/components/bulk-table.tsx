"use client";
import Link from "next/link";
import { useState } from "react";
import { bulkAction } from "@/app/(app)/actions";
import type { Row } from "@/lib/db";

const fmt = (d?: string | null) => (d ? new Date(d.replace(" ", "T")).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—");
const PRIO: Record<string, string> = { hot: "bg-red-100 text-red-700", high: "bg-orange-100 text-orange-700", medium: "bg-slate-100 text-slate-700", low: "bg-slate-50 text-slate-500" };

export function BulkTable({ rows, users, stages, perms, priorities }: {
  rows: Row[]; users: Row[]; stages: Row[]; perms: { assign: boolean; edit: boolean; del: boolean }; priorities: string[];
}) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [op, setOp] = useState(perms.assign ? "assign" : "stage");
  const [stage, setStage] = useState("");
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = rows.length > 0 && sel.size === rows.length;
  const canBulk = perms.assign || perms.edit || perms.del;
  const isLost = stages.find((s) => String(s.id) === stage)?.is_lost;

  return (
    <form action={async (f) => { await bulkAction(f); setSel(new Set()); }}
      onSubmit={(e) => { if (op === "delete" && !confirm(`Permanently delete ${sel.size} lead(s)? This is audited and cannot be undone.`)) e.preventDefault(); }}
      className="card overflow-hidden p-0">
      {canBulk && sel.size > 0 && (
        <div className="flex flex-wrap items-end gap-2 border-b border-slate-200 bg-indigo-50 p-3 text-sm">
          <strong>{sel.size} selected</strong>
          <select value={op} onChange={(e) => setOp(e.target.value)} className="input w-auto" aria-label="Bulk action">
            {perms.assign && <option value="assign">Assign / transfer</option>}
            {perms.edit && <option value="stage">Change status</option>}
            {perms.edit && <option value="priority">Set priority</option>}
            {perms.edit && <option value="tag">Add tag</option>}
            {perms.del && <option value="delete">Delete</option>}
          </select>
          <input type="hidden" name="op" value={op} />
          {op === "assign" && <select name="owner_id" className="input w-auto" aria-label="Assign to"><option value="">Unassign</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
          {op === "stage" && <select name="stage_id" required value={stage} onChange={(e) => setStage(e.target.value)} className="input w-auto" aria-label="Stage"><option value="">Select…</option>{stages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
          {op === "stage" && isLost && <input name="lost_reason" required placeholder="Lost reason" className="input w-48" />}
          {op === "priority" && <select name="priority" className="input w-auto" aria-label="Priority">{priorities.map((p) => <option key={p}>{p}</option>)}</select>}
          {op === "tag" && <input name="tag" required placeholder="tag" className="input w-40" />}
          <button className={op === "delete" ? "btn-danger" : "btn"}>Apply</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              {canBulk && <th><input type="checkbox" aria-label="Select all" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} /></th>}
              <th className="max-md:sticky max-md:left-0 max-md:z-[1]">Lead</th><th>Mobile</th><th>Business / city</th><th>Source / campaign</th><th>Status</th><th>Owner</th><th>Priority</th>
              <th title="Lead score 0–100 · predicted win %">Score</th><th>Calls</th><th>Next follow-up</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {canBulk && <td><input type="checkbox" name="ids" value={r.id} checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} /></td>}
                <td className="max-md:sticky max-md:left-0 max-md:z-[1] max-md:bg-surface max-md:shadow-[1px_0_0_var(--color-slate-200)]"><Link className="link font-medium" href={`/leads/${r.id}`}>{r.name}</Link><div className="text-xs text-slate-400">{r.lead_code}{r.tags ? ` · ${r.tags}` : ""}</div></td>
                <td className="whitespace-nowrap"><a className="link" href={`tel:${r.mobile}`}>{r.mobile}</a></td>
                <td>{r.business_name ?? "—"}<div className="text-xs text-slate-400">{r.city}</div></td>
                <td>{r.source}<div className="text-xs text-slate-400">{r.campaign_name}</div></td>
                <td><span className="badge" style={{ background: r.color + "22", color: r.color }}>{r.stage}</span></td>
                <td>{r.owner ?? <span className="text-amber-600">Unassigned</span>}</td>
                <td><span className={`badge ${PRIO[r.priority] ?? "bg-slate-100 text-slate-700"}`}>{r.priority}</span></td>
                <td className="tabular-nums" title={r.win_prob != null ? `${Number(r.win_prob).toFixed(0)}% predicted win` : ""}>{r.score}</td>
                <td className="tabular-nums">{r.total_calls}</td>
                <td className={`whitespace-nowrap ${r.next_followup_at && new Date(r.next_followup_at.replace(" ", "T")) < new Date() ? "text-red-600" : ""}`}>{fmt(r.next_followup_at)}</td>
                <td className="whitespace-nowrap text-slate-500">{fmt(r.created_at)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={11} className="p-6 text-center text-slate-500">No leads match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </form>
  );
}
