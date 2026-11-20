import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { Empty, fmtDate } from "@/components/ui";
import { changePassword, markNotificationsRead, saveMyChannels, setAvailability } from "../actions";

export default async function Notifications() {
  const u = await requireUser();
  const [rows, [me]] = await Promise.all([
    q("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 200", [u.id]),
    q("SELECT available, phone, notify_channels FROM users WHERE id=?", [u.id]),
  ]);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">Notifications</h1>
        <form action={markNotificationsRead}><button className="btn-ghost">Mark all read</button></form>
      </div>
      <ul className="card divide-y divide-slate-100 p-0">
        {rows.map((n) => (
          <li key={n.id} className={`px-4 py-2 text-sm ${n.read_at ? "text-slate-500" : "font-medium"}`}>
            {n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}
            <div className="text-xs font-normal text-slate-400">{fmtDate(n.created_at)}</div>
          </li>
        ))}
        {!rows.length && <Empty>No notifications yet.</Empty>}
      </ul>

      <section className="card flex flex-wrap items-end gap-6">
        <form action={setAvailability} className="flex items-center gap-2 text-sm">
          My status: <b>{me.available ? "Available" : "Unavailable (no new auto-assigned leads)"}</b>
          <input type="hidden" name="available" value={me.available ? "0" : "1"} />
          <button className="btn-ghost">{me.available ? "Go unavailable" : "Go available"}</button>
        </form>
        <form action={saveMyChannels} className="flex flex-wrap items-center gap-2 text-sm">
          Also notify me by:
          {["email", "whatsapp", "sms"].map((c) => (
            <label key={c} className="flex items-center gap-1"><input type="checkbox" name="notify_channels" value={c} defaultChecked={String(me.notify_channels ?? "").split(",").includes(c)} /> {c}</label>
          ))}
          <input name="phone" type="tel" defaultValue={me.phone ?? ""} placeholder="My mobile" className="input w-36" aria-label="My mobile" />
          <button className="btn-ghost">Save</button>
        </form>
        <form action={changePassword} className="flex items-center gap-2">
          <input name="password" type="password" minLength={8} required placeholder="New password" className="input w-48" autoComplete="new-password" aria-label="New password" />
          <button className="btn-ghost">Change password</button>
        </form>
      </section>
    </>
  );
}
