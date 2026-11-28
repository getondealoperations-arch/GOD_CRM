import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { Empty, fmtDate, num, PriorityBadge, StageBadge } from "@/components/ui";

/** A target bar. With no target set it just shows the count. */
function Progress({ label, value, target, note }: { label: string; value: number; target: number; note: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className="card">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-slate-500">{label}</span>
        {target > 0 && <span className="text-xs tabular-nums text-slate-500">{pct}%</span>}
      </div>
      <div className="mt-1 font-display text-2xl font-semibold leading-none tracking-tight tabular-nums">
        {num(value)}{target > 0 && <span className="text-base font-normal text-slate-400"> / {num(target)}</span>}
      </div>
      {target > 0 && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={target}>
          <div className={`h-full rounded-full ${pct >= 100 ? "bg-green-600" : "bg-indigo-600"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="mt-2 text-xs text-slate-500">{target > 0 ? note : "No target set. Ask your manager."}</div>
    </div>
  );
}

export default async function Work() {
  const u = await requireUser();
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date())) % 24;
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const [[me], next, due, fresh] = await Promise.all([
    q(`SELECT
         (SELECT target_calls FROM users WHERE id=?) target_calls, (SELECT target_followups FROM users WHERE id=?) target_followups,
         (SELECT target_conversions FROM users WHERE id=?) target_conversions,
         (SELECT COUNT(*) FROM calls c WHERE c.user_id=? AND DATE(c.started_at)=CURDATE()) calls_today,
         (SELECT COUNT(*) FROM followups f WHERE f.assigned_to=? AND f.status='done' AND DATE(f.completed_at)=CURDATE()) fu_done,
         (SELECT COUNT(*) FROM sales sa WHERE sa.user_id=? AND MONTH(sa.sale_date)=MONTH(CURDATE()) AND YEAR(sa.sale_date)=YEAR(CURDATE())) converted_month,
         (SELECT COUNT(*) FROM followups f WHERE f.assigned_to=? AND f.status='pending' AND f.due_at<NOW()) overdue,
         (SELECT COUNT(*) FROM leads l WHERE l.owner_id=? AND l.total_calls=0) uncalled`, Array(8).fill(u.id)),
    // Same ordering as the Calling workspace queue: due follow-ups, then never-called leads, best score first.
    q(`SELECT l.id, l.name, l.mobile, l.business_name, l.priority, l.score, l.total_calls, l.next_followup_at, s.name stage, s.color,
         CASE WHEN l.next_followup_at<=NOW() THEN 'Follow-up due' WHEN l.total_calls=0 THEN 'New lead' ELSE 'Follow-up today' END reason,
         CASE WHEN l.next_followup_at<=NOW() THEN 0 WHEN l.total_calls=0 THEN 1 ELSE 2 END bucket
       FROM leads l JOIN stages s ON s.id=l.stage_id
       WHERE l.owner_id=? AND s.is_won=0 AND s.is_lost=0 AND l.dnd=0
         AND (l.next_followup_at<=NOW() + INTERVAL 30 MINUTE OR l.total_calls=0 OR DATE(l.next_followup_at)=CURDATE())
       ORDER BY bucket, l.score DESC, COALESCE(l.next_followup_at, l.created_at) LIMIT 5`, [u.id]),
    q(`SELECT f.id, f.due_at, f.note, l.id lead_id, l.name FROM followups f JOIN leads l ON l.id=f.lead_id
       WHERE f.assigned_to=? AND f.status='pending' AND (f.due_at<NOW() OR DATE(f.due_at)=CURDATE()) ORDER BY f.due_at LIMIT 8`, [u.id]),
    q(`SELECT l.id, l.name, l.business_name, l.city, l.assigned_at, l.priority, s.name stage, s.color
       FROM leads l JOIN stages s ON s.id=l.stage_id
       WHERE l.owner_id=? AND l.total_calls=0 AND l.assigned_at >= NOW() - INTERVAL 2 DAY ORDER BY l.assigned_at DESC LIMIT 6`, [u.id]),
  ]);

  const calling = can(u, "calls.log");
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">{greeting}, {u.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {Number(me.overdue) > 0 ? <><span className="font-medium text-red-600">{me.overdue} overdue follow-up{Number(me.overdue) === 1 ? "" : "s"}</span>. Start with those.</>
              : Number(me.uncalled) > 0 ? `${me.uncalled} new lead${Number(me.uncalled) === 1 ? "" : "s"} waiting for a first call.` : "You are all caught up."}
          </p>
        </div>
        <div className="flex gap-2">
          {can(u, "lead.create") && <Link href="/leads/new" className="btn-ghost">New lead</Link>}
          {calling && <Link href="/calling" className="btn">Start calling</Link>}
        </div>
      </div>

      <section aria-label="Today's targets" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Progress label="Calls today" value={Number(me.calls_today)} target={Number(me.target_calls)} note="Dial every lead in your queue." />
        <Progress label="Follow-ups done today" value={Number(me.fu_done)} target={Number(me.target_followups)} note="Mark each one done with an outcome." />
        <Progress label="Conversions this month" value={Number(me.converted_month)} target={Number(me.target_conversions)} note="Sales you booked this month." />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <section className="card p-0 lg:col-span-3" aria-labelledby="next-up">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 id="next-up" className="h2">Call these next</h2>
            {calling && <Link href="/calling" className="link text-sm">Open full queue</Link>}
          </div>
          <ul className="divide-y divide-slate-100">
            {next.map((x) => (
              <li key={x.id}>
                <Link href={calling ? `/calling?lead=${x.id}` : `/leads/${x.id}`} className="block px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{x.name}</span>
                    <span className={`badge ${x.bucket === 0 ? "bg-red-100 text-red-700" : x.bucket === 1 ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{x.reason}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{x.mobile}</span>{x.business_name && <span>{x.business_name}</span>}
                    <StageBadge name={x.stage} color={x.color} /><PriorityBadge p={x.priority} />
                    <span>{x.next_followup_at ? fmtDate(x.next_followup_at) : `${x.total_calls} calls`}</span>
                  </div>
                </Link>
              </li>
            ))}
            {!next.length && <Empty>Nothing is waiting for a call. New leads appear here as soon as they are assigned to you.</Empty>}
          </ul>
        </section>

        <div className="space-y-4 lg:col-span-2">
          <section className="card p-0" aria-labelledby="fu-due">
            <div className="flex items-center justify-between px-4 pt-4">
              <h2 id="fu-due" className="h2">Follow-ups due</h2>
              <Link href="/followups" className="link text-sm">All follow-ups</Link>
            </div>
            <ul className="divide-y divide-slate-100">
              {due.map((f) => (
                <li key={f.id}>
                  <Link href={`/leads/${f.lead_id}`} className="block px-4 py-2.5 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{f.name}</span>
                      <span className={`text-xs ${new Date(String(f.due_at).replace(" ", "T")) < new Date() ? "text-red-600" : "text-slate-500"}`}>{fmtDate(f.due_at)}</span>
                    </div>
                    {f.note && <div className="truncate text-xs text-slate-500">{f.note}</div>}
                  </Link>
                </li>
              ))}
              {!due.length && <Empty>No follow-ups due today.</Empty>}
            </ul>
          </section>

          <section className="card p-0" aria-labelledby="fresh">
            <h2 id="fresh" className="h2 px-4 pt-4">Newly assigned to you</h2>
            <ul className="divide-y divide-slate-100">
              {fresh.map((x) => (
                <li key={x.id}>
                  <Link href={`/leads/${x.id}`} className="block px-4 py-2.5 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{x.name}</span><span className="text-xs text-slate-500">{fmtDate(x.assigned_at)}</span>
                    </div>
                    <div className="truncate text-xs text-slate-500">{[x.business_name, x.city].filter(Boolean).join(", ") || "No business details yet"}</div>
                  </Link>
                </li>
              ))}
              {!fresh.length && <Empty>No new leads in the last 2 days.</Empty>}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
