import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { str, type SP } from "@/lib/filters";
import { fmtDate, Pager } from "@/components/ui";

export default async function Audit({ searchParams }: PageProps<"/audit">) {
  await requireUser("audit.view");
  const sp = (await searchParams) as SP;
  const page = Math.max(1, Number(str(sp.page)) || 1);
  const w: string[] = ["1=1"];
  const p: (string | number)[] = [];
  if (str(sp.entity)) { w.push("a.entity=?"); p.push(str(sp.entity)); }
  if (str(sp.action)) { w.push("a.action=?"); p.push(str(sp.action)); }
  if (str(sp.entity_id)) { w.push("a.entity_id=?"); p.push(str(sp.entity_id)); }
  if (str(sp.user)) { w.push("a.user_id=?"); p.push(Number(str(sp.user))); }
  const where = w.join(" AND ");
  const [[{ c }], rows, actions, users] = await Promise.all([
    q(`SELECT COUNT(*) c FROM audit_logs a WHERE ${where}`, p),
    q(`SELECT a.*, us.name user FROM audit_logs a LEFT JOIN users us ON us.id=a.user_id WHERE ${where} ORDER BY a.id DESC LIMIT 100 OFFSET ?`, [...p, (page - 1) * 100]),
    q("SELECT DISTINCT action FROM audit_logs ORDER BY action"),
    q("SELECT id, name FROM users ORDER BY name"),
  ]);
  const query = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "page" && str(v)).map(([k, v]) => [k, str(v)])).toString();

  return (
    <>
      <h1 className="h1">Audit log</h1>
      <form className="card flex flex-wrap items-end gap-2">
        <label className="text-xs">Entity<select name="entity" defaultValue={str(sp.entity)} className="input">
          <option value="">All</option>{["lead", "sale", "campaign", "spend", "user", "team", "stage", "settings", "report", "assignment_rules"].map((e) => <option key={e}>{e}</option>)}</select></label>
        <label className="text-xs">Action<select name="action" defaultValue={str(sp.action)} className="input"><option value="">All</option>{actions.map((a) => <option key={a.action}>{a.action}</option>)}</select></label>
        <label className="text-xs">User<select name="user" defaultValue={str(sp.user)} className="input"><option value="">All</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="text-xs">Record ID<input name="entity_id" defaultValue={str(sp.entity_id)} className="input w-24" /></label>
        <button className="btn">Filter</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">{fmtDate(r.created_at)}</td><td>{r.user ?? "system / API"}</td><td>{r.action}</td>
              <td>{r.entity === "lead" && r.entity_id ? <a className="link" href={`/leads/${r.entity_id}`}>lead #{r.entity_id}</a> : `${r.entity}${r.entity_id ? ` #${r.entity_id}` : ""}`}</td>
              <td className="max-w-xl break-all font-mono text-xs text-slate-600">{r.details}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Pager page={page} total={c} perPage={100} query={query} />
    </>
  );
}
