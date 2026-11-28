import Link from "next/link";
import { can, leadScope, requireUser, ROLE_LABEL, type Role } from "@/lib/auth";
import { q } from "@/lib/db";
import { str, type SP } from "@/lib/filters";
import { FilterBar } from "@/components/filter-bar";
import { SplitPicker } from "@/components/split-picker";
import { splitAssign } from "@/app/(app)/actions";

export default async function Distribute({ searchParams }: PageProps<"/leads/distribute">) {
  const u = await requireUser("lead.assign");
  const sp = (await searchParams) as SP;
  const sc = leadScope(u);

  // The pool: open leads nobody owns yet, narrowed by the filters above.
  const where = ["l.owner_id IS NULL", "s.is_won=0", "s.is_lost=0", sc.sql];
  const params: (string | number)[] = [...sc.params];
  const filters = { campaign_id: str(sp.campaign), source: str(sp.source), city: str(sp.city), category: str(sp.category) };
  for (const [k, v] of Object.entries(filters)) if (v) { where.push(`l.${k}=?`); params.push(v); }
  const [{ n: pool }] = await q<{ n: number }>(`SELECT COUNT(*) n FROM leads l JOIN stages s ON s.id=l.stage_id WHERE ${where.join(" AND ")}`, params);

  // Who can take work: active and available executives (a team leader sees only their own team).
  const team = can(u, "lead.view_all") ? "" : ` AND us.team_id=${Number(u.team_id ?? -1)}`;
  const emps = (await q(
    `SELECT us.id, us.name, us.role, t.name team,
       (SELECT COUNT(*) FROM leads l JOIN stages s ON s.id=l.stage_id WHERE l.owner_id=us.id AND s.is_won=0 AND s.is_lost=0) open_leads
     FROM users us LEFT JOIN teams t ON t.id=us.team_id
     WHERE us.active=1 AND us.available=1 AND us.role IN ('calling_executive','sales_executive','team_leader')${team}
     ORDER BY open_leads, us.name`)).map((e) => ({ id: e.id as number, name: e.name as string, role: ROLE_LABEL[e.role as Role], team: e.team as string | null, open_leads: Number(e.open_leads) }));

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="h1">Split and assign</h1>
        <Link href="/leads" className="link text-sm">Back to leads</Link>
      </div>
      <p className="max-w-2xl text-sm text-slate-600">
        Share unassigned leads equally between employees. The best-scored leads are dealt out first, one person at a time, so everyone gets a fair mix. Each employee gets one notification with their count.
      </p>

      {sp.done != null && <p role="status" className="rounded-md border border-green-200 bg-green-100 p-2.5 text-sm text-green-700">Assigned {str(sp.done)} lead{str(sp.done) === "1" ? "" : "s"}. Each employee has been notified.</p>}
      {sp.error != null && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{str(sp.error)}</p>}

      <FilterBar sp={sp} fields={["campaign", "source", "category", "city"]} />

      <form action={splitAssign} className="card max-w-2xl space-y-4">
        {Object.entries(filters).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <div>
          <div className="text-sm text-slate-500">Unassigned leads in this pool</div>
          <div className="font-display text-3xl font-semibold tracking-tight tabular-nums">{Number(pool).toLocaleString("en-IN")}</div>
        </div>
        <SplitPicker emps={emps} pool={Number(pool)} />
      </form>
    </>
  );
}
