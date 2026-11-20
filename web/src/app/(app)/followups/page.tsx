import Link from "next/link";
import { can, leadScope, requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { str, type SP } from "@/lib/filters";
import { Empty, fmtDate } from "@/components/ui";
import { completeFollowup, reassignFollowup } from "../actions";

const TABS = { overdue: "Overdue", today: "Today", upcoming: "Upcoming", done: "Completed" } as const;
const WHERE: Record<string, string> = {
  overdue: "f.status='pending' AND f.due_at<NOW()",
  today: "f.status='pending' AND f.due_at>=NOW() AND DATE(f.due_at)=CURDATE()",
  upcoming: "f.status='pending' AND DATE(f.due_at)>CURDATE()",
  done: "f.status IN ('done','cancelled')",
};

export default async function Followups({ searchParams }: PageProps<"/followups">) {
  const u = await requireUser();
  const sp = (await searchParams) as SP;
  const tab = (str(sp.tab) in TABS ? str(sp.tab) : "today") as keyof typeof TABS;
  const sc = leadScope(u);
  const mine = str(sp.mine) === "1" || !(can(u, "lead.view_all") || can(u, "lead.view_team"));
  const owner = str(sp.owner) ? Number(str(sp.owner)) : null;
  const extra = mine ? " AND f.assigned_to=" + u.id : owner ? " AND f.assigned_to=" + owner : "";
  const counts = await q(
    `SELECT ${Object.entries(WHERE).map(([k, w]) => `SUM(${w}) ${k}`).join(",")} FROM followups f JOIN leads l ON l.id=f.lead_id WHERE ${sc.sql}${extra}`, sc.params);
  const rows = await q(
    `SELECT f.*, l.name lead, l.mobile, l.lead_code, us.name user FROM followups f JOIN leads l ON l.id=f.lead_id LEFT JOIN users us ON us.id=f.assigned_to
     WHERE ${WHERE[tab]} AND ${sc.sql}${extra} ORDER BY ${tab === "done" ? "f.completed_at DESC" : "f.due_at"} LIMIT 300`, sc.params);
  const users = can(u, "lead.assign") ? await q("SELECT id, name FROM users WHERE active=1 AND role<>'viewer' ORDER BY name") : [];
  const qs = (t: string) => `?tab=${t}${mine && str(sp.mine) ? "&mine=1" : ""}${owner ? `&owner=${owner}` : ""}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">Follow-ups</h1>
        {(can(u, "lead.view_all") || can(u, "lead.view_team")) && (
          <div className="flex gap-2 text-sm">
            <Link className={!mine ? "font-semibold" : "link"} href={`?tab=${tab}`}>Team</Link>
            <Link className={mine ? "font-semibold" : "link"} href={`?tab=${tab}&mine=1`}>Mine</Link>
          </div>
        )}
      </div>
      <nav className="flex gap-2">
        {Object.entries(TABS).map(([k, l]) => (
          <Link key={k} href={qs(k)} className={tab === k ? "btn" : "btn-ghost"}>
            {l} <span className={`badge ${k === "overdue" && counts[0][k] > 0 ? "bg-red-100 text-red-700" : "bg-surface/30"}`}>{counts[0][k] ?? 0}</span>
          </Link>
        ))}
      </nav>
      <div className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead><tr><th>Due</th><th>Lead</th><th>Responsible</th><th>Note</th><th>{tab === "done" ? "Outcome" : "Complete"}</th>{users.length > 0 && tab !== "done" && <th>Reassign</th>}</tr></thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id}>
                <td className={`whitespace-nowrap ${tab === "overdue" ? "text-red-600" : ""}`}>{fmtDate(f.due_at)}{f.escalated ? <div className="text-xs text-amber-700">escalated</div> : null}</td>
                <td><Link className="link" href={`/leads/${f.lead_id}`}>{f.lead}</Link><div className="text-xs"><a className="link" href={`tel:${f.mobile}`}>{f.mobile}</a> · {f.lead_code}</div></td>
                <td>{f.user ?? "—"}</td>
                <td className="max-w-xs text-xs">{f.note}</td>
                <td>
                  {tab === "done" ? <span className="text-xs">{f.status}: {f.outcome} <span className="text-slate-400">({fmtDate(f.completed_at)})</span></span> : (
                    <form action={completeFollowup} className="flex gap-1">
                      <input type="hidden" name="id" value={f.id} />
                      <input name="outcome" placeholder="Outcome" className="input w-40 py-1 text-xs" aria-label="Outcome" />
                      <button className="btn-ghost px-2 py-1 text-xs">Done</button>
                    </form>
                  )}
                </td>
                {users.length > 0 && tab !== "done" && (
                  <td>
                    <form action={reassignFollowup} className="flex gap-1">
                      <input type="hidden" name="id" value={f.id} />
                      <select name="assigned_to" defaultValue={f.assigned_to ?? ""} className="input w-36 py-1 text-xs" aria-label="Reassign to">{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                      <button className="btn-ghost px-2 py-1 text-xs">Move</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty>Nothing here.</Empty>}
      </div>
    </>
  );
}
