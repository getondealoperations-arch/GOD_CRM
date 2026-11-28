import Link from "next/link";
import { can, requireUser, ROLE_LABEL, type Role } from "@/lib/auth";
import { q } from "@/lib/db";
import { dur, fmtDate } from "@/components/ui";
import { listRequests } from "@/lib/access-requests";
import { approveAccessRequest, reassignOpenLeads, rejectAccessRequest, saveTeam, saveUser } from "../actions";

const ROLES = Object.keys(ROLE_LABEL) as Role[];

export default async function Team() {
  const u = await requireUser("reports.view");
  const manage = can(u, "users.manage");
  const requests = manage ? await listRequests() : [];
  const teamOnly = !can(u, "lead.view_all") ? ` WHERE us.team_id=${Number(u.team_id ?? -1)}` : "";
  const [users, teams] = await Promise.all([
    q(`SELECT us.*, t.name team, m.name manager,
         (SELECT COUNT(*) FROM calls c WHERE c.user_id=us.id AND DATE(c.started_at)=CURDATE()) calls_today,
         (SELECT COALESCE(SUM(duration_sec),0) FROM calls c WHERE c.user_id=us.id AND DATE(c.started_at)=CURDATE()) talk_today,
         (SELECT COUNT(*) FROM followups f WHERE f.assigned_to=us.id AND f.status='done' AND DATE(f.completed_at)=CURDATE()) fu_today,
         (SELECT COUNT(*) FROM followups f WHERE f.assigned_to=us.id AND f.status='pending' AND f.due_at<NOW()) overdue,
         (SELECT COUNT(*) FROM sales sa WHERE sa.user_id=us.id AND sa.sale_date=CURDATE()) conv_today,
         (SELECT COUNT(*) FROM leads l WHERE l.owner_id=us.id AND l.assigned_at>=CURDATE()) assigned_today,
         (SELECT COUNT(*) FROM leads l WHERE l.owner_id=us.id) total_leads
       FROM users us LEFT JOIN teams t ON t.id=us.team_id LEFT JOIN users m ON m.id=us.manager_id${teamOnly}
       ORDER BY us.active DESC, t.name, us.name`),
    q("SELECT t.*, us.name leader, (SELECT COUNT(*) FROM users x WHERE x.team_id=t.id AND x.active=1) members FROM teams t LEFT JOIN users us ON us.id=t.leader_id ORDER BY t.name"),
  ]);
  const vs = (a: number, t: number) => <span className={t && a >= t ? "text-green-700" : ""}>{a}{t ? <span className="text-slate-400">/{t}</span> : null}</span>;

  const verticals = (await q("SELECT DISTINCT category v FROM leads WHERE category IS NOT NULL AND category<>'' ORDER BY category")).map((r) => r.v as string);
  const assignable = users.filter((m) => m.active && ["calling_executive", "sales_executive", "team_leader"].includes(m.role));
  const userForm = (x: Record<string, never> = {}) => (
    <form action={saveUser} className="grid gap-2 p-2 sm:grid-cols-4">
      {x.id && <input type="hidden" name="id" value={x.id} />}
      <input name="name" defaultValue={x.name} placeholder="Name *" required className="input" aria-label="Name" />
      <input name="email" type="email" defaultValue={x.email} placeholder="Email *" required className="input" aria-label="Email" />
      <select name="role" defaultValue={x.role ?? "calling_executive"} className="input" aria-label="Role">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
      <input name="password" type="password" placeholder={x.id ? "New password (optional)" : "Password * (min 8)"} className="input" aria-label="Password" minLength={8} required={!x.id} autoComplete="new-password" />
      <select name="team_id" defaultValue={x.team_id ?? ""} className="input" aria-label="Team"><option value="">No team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <select name="manager_id" defaultValue={x.manager_id ?? ""} className="input" aria-label="Reports to"><option value="">Reports to…</option>{users.filter((m) => m.id !== x.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      <label className="text-xs">Max leads / day<input name="daily_lead_cap" type="number" min="0" defaultValue={x.daily_lead_cap ?? 50} className="input" /></label>
      <label className="text-xs">Daily call target<input name="target_calls" type="number" min="0" defaultValue={x.target_calls ?? 0} className="input" /></label>
      <label className="text-xs">Daily follow-up target<input name="target_followups" type="number" min="0" defaultValue={x.target_followups ?? 0} className="input" /></label>
      <label className="text-xs">Daily conversion target<input name="target_conversions" type="number" min="0" defaultValue={x.target_conversions ?? 0} className="input" /></label>
      <label className="text-xs">Phone (click-to-call, WhatsApp/SMS alerts)<input name="phone" type="tel" defaultValue={x.phone ?? ""} className="input" /></label>
      <label className="text-xs">Vertical (limits visible leads to one category)
        <select name="vertical" defaultValue={x.vertical ?? ""} className="input"><option value="">All verticals</option>{verticals.map((v) => <option key={v}>{v}</option>)}</select></label>
      <fieldset className="text-xs sm:col-span-2"><legend>Notify also by</legend>
        <div className="flex gap-3 text-sm">{["email", "whatsapp", "sms"].map((c) => (
          <label key={c} className="flex items-center gap-1"><input type="checkbox" name="notify_channels" value={c} defaultChecked={String(x.notify_channels ?? "").split(",").includes(c)} /> {c}</label>))}</div>
      </fieldset>
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="active" defaultChecked={x.id ? !!x.active : true} /> Active</label>
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="available" defaultChecked={x.id ? !!x.available : true} /> Available for auto-assignment</label>
      <button className="btn sm:col-span-4">{x.id ? "Save user" : "Create user"}</button>
    </form>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">Team & employees</h1>
        <Link className="btn-ghost" href="/reports?report=employee">Employee performance report →</Link>
      </div>

      {requests.length > 0 && (
        <section className="card space-y-2" aria-labelledby="requests">
          <div>
            <h2 id="requests" className="h2 mb-0">Access requests ({requests.length})</h2>
            <p className="text-sm text-slate-500">People who asked for an account on the employee sign-in page. They cannot sign in until you approve.</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {requests.map((r) => (
              <li key={r.email} className="grid gap-3 py-3 lg:grid-cols-[1fr_auto] lg:items-end">
                <div className="min-w-0">
                  <div className="font-medium">{r.name}</div>
                  <div className="truncate text-sm text-slate-500">{r.email}{r.phone ? `, ${r.phone}` : ""}, asked {fmtDate(r.requested_at)}</div>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <form action={approveAccessRequest} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="email" value={r.email} />
                    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Role
                      <select name="role" defaultValue="calling_executive" className="input w-auto font-normal text-slate-900">
                        {(["calling_executive", "sales_executive", "team_leader"] as Role[]).map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
                      </select></label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Team
                      <select name="team_id" defaultValue="" className="input w-auto font-normal text-slate-900"><option value="">No team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                    <button className="btn">Approve</button>
                  </form>
                  <form action={rejectAccessRequest}><input type="hidden" name="email" value={r.email} /><button className="btn-ghost">Reject</button></form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead><tr><th>Employee</th><th>Role</th><th>Team / reports to</th><th>Status</th><th>Assigned today (cap)</th><th>Calls today / target</th><th>Talk</th>
            <th>Follow-ups done / target</th><th>Overdue</th><th>Conversions / target</th><th>Open leads</th></tr></thead>
          {users.map((x) => (
            <tbody key={x.id}>
            <tr className={x.active ? "" : "opacity-50"}>
              <td>
                <div className="font-medium">{x.name}</div><div className="text-xs text-slate-400">{x.email}</div>
                {manage && (u.role === "super_admin" || x.role !== "super_admin") && <details data-edit><summary className="cursor-pointer text-xs text-indigo-600">edit</summary></details>}
                {can(u, "lead.assign") && x.total_leads > 0 && (
                  <details><summary className="cursor-pointer text-xs text-indigo-600">reassign open leads</summary>
                    <form action={reassignOpenLeads} className="flex gap-1 p-1">
                      <input type="hidden" name="from" value={x.id} />
                      <select name="to" className="input py-1 text-xs" aria-label="Reassign to"><option value="auto">Round robin (rules, caps)</option>
                        {assignable.filter((m) => m.id !== x.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                      <button className="btn-ghost px-2 py-1 text-xs">Move</button>
                    </form>
                  </details>)}
              </td>
              <td>{ROLE_LABEL[x.role as Role]}</td>
              <td>{x.team ?? "—"}<div className="text-xs text-slate-400">{x.manager}{x.vertical ? ` · ${x.vertical} only` : ""}</div></td>
              <td>{!x.active ? "inactive" : x.available ? <span className="text-green-700">available</span> : <span className="text-amber-700">unavailable</span>}</td>
              <td>{x.assigned_today} <span className="text-slate-400">({x.daily_lead_cap})</span></td>
              <td>{vs(x.calls_today, x.target_calls)}</td><td>{dur(Number(x.talk_today))}</td>
              <td>{vs(x.fu_today, x.target_followups)}</td>
              <td className={x.overdue ? "text-red-600" : ""}>{x.overdue}</td>
              <td>{vs(x.conv_today, x.target_conversions)}</td>
              <td><Link className="link" href={`/leads?owner=${x.id}&conversion=open`}>{x.total_leads}</Link></td>
            </tr>
            {manage && (u.role === "super_admin" || x.role !== "super_admin") && (
              <tr className="edit-row">
                <td colSpan={11} className="bg-slate-50 p-0">
                  {/* sticky + a viewport-based width keeps the form on screen when the table scrolls sideways on a phone */}
                  <div className="sticky left-0 w-[calc(100vw-3rem)] max-w-5xl p-3 md:w-[calc(100vw-19rem)]">{userForm(x as never)}</div>
                </td>
              </tr>
            )}
            </tbody>
          ))}
        </table>
      </div>

      {manage && <details className="card"><summary className="cursor-pointer font-medium text-indigo-700">+ Add user</summary>{userForm()}</details>}

      <section className="card">
        <h2 className="h2">Teams & departments</h2>
        <div className="mb-3 overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Team</th><th>Department</th><th>Leader</th><th>Members</th>{manage && <th>Edit</th>}</tr></thead>
          <tbody>{teams.map((t) => (
            <tr key={t.id}><td>{t.name}</td><td>{t.department}</td><td>{t.leader ?? "—"}</td><td>{t.members}</td>
              {manage && <td>
                <form action={saveTeam} className="flex gap-1">
                  <input type="hidden" name="id" value={t.id} /><input type="hidden" name="name" value={t.name} /><input type="hidden" name="department" value={t.department ?? ""} />
                  <select name="leader_id" defaultValue={t.leader_id ?? ""} className="input py-1 text-xs" aria-label="Leader"><option value="">No leader</option>{users.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                  <button className="btn-ghost px-2 py-1 text-xs">Set leader</button>
                </form>
              </td>}
            </tr>
          ))}</tbody>
        </table>
        </div>
        {manage && (
          <form action={saveTeam} className="flex flex-wrap gap-2">
            <input name="name" placeholder="New team name" required className="input w-48" aria-label="Team name" />
            <input name="department" placeholder="Department" className="input w-48" aria-label="Department" />
            <select name="leader_id" className="input w-48" aria-label="Leader"><option value="">Leader…</option>{users.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <button className="btn-ghost">Add team</button>
          </form>
        )}
      </section>
    </>
  );
}
