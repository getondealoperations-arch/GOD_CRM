import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { filterQuery, leadWhere, str, type SP } from "@/lib/filters";
import { FilterBar } from "@/components/filter-bar";
import { BulkTable } from "@/components/bulk-table";
import { Pager } from "@/components/ui";
import { saveView } from "../actions";
import { getPriorities, prioritySql } from "@/lib/leads";

const PER_PAGE = 50;
const SORTS: Record<string, string> = {
  new: "l.id DESC", old: "l.id ASC", score: "l.score DESC, l.id DESC", followup: "l.next_followup_at IS NULL, l.next_followup_at",
  contact: "l.last_contact_at IS NULL, l.last_contact_at", priority: "",
};

export default async function Leads({ searchParams }: PageProps<"/leads">) {
  const u = await requireUser();
  const sp = (await searchParams) as SP;
  const page = Math.max(1, Number(str(sp.page)) || 1);
  const priorities = await getPriorities();
  const sort = str(sp.sort) === "priority" ? prioritySql(priorities) : SORTS[str(sp.sort)] || SORTS.new;
  const w = leadWhere(u, sp);
  const [{ c: total }] = await q(`SELECT COUNT(*) c FROM leads l WHERE ${w.where}`, w.params);
  const rows = await q(
    `SELECT l.id, l.lead_code, l.name, l.mobile, l.business_name, l.city, l.source, l.campaign_name, l.priority, l.created_at, l.next_followup_at,
       l.last_contact_at, l.total_calls, l.tags, l.score, l.win_prob, s.name stage, s.color, ou.name owner
     FROM leads l JOIN stages s ON s.id=l.stage_id LEFT JOIN users ou ON ou.id=l.owner_id
     WHERE ${w.where} ORDER BY ${sort} LIMIT ? OFFSET ?`, [...w.params, PER_PAGE, (page - 1) * PER_PAGE]);
  const [users, stages, views] = await Promise.all([
    q("SELECT id, name FROM users WHERE active=1 AND role NOT IN ('viewer') ORDER BY name"),
    q("SELECT id, name, is_lost FROM stages ORDER BY position"),
    q("SELECT id, name, query FROM saved_views WHERE user_id=? ORDER BY name", [u.id]),
  ]);
  const query = filterQuery(sp, str(sp.sort) ? { sort: str(sp.sort) } : {});
  const rw = leadWhere(u, { reactivation: "1" });
  const reactivation = (await one(`SELECT COUNT(*) c FROM leads l WHERE ${rw.where}`, rw.params))!.c;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">Leads</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/leads?reactivation=1" className="btn-ghost">Reactivation queue ({reactivation})</Link>
          {can(u, "lead.export") && <>
            <a className="btn-ghost" href={`/api/export?${filterQuery(sp, { format: "csv" })}`}>Export CSV</a>
            <a className="btn-ghost" href={`/api/export?${filterQuery(sp, { format: "xlsx" })}`}>Export Excel</a>
          </>}
          {can(u, "lead.import") && <Link href="/leads/import" className="btn-ghost">Import</Link>}
          {can(u, "lead.create") && <Link href="/leads/new" className="btn">+ New lead</Link>}
        </div>
      </div>

      <FilterBar sp={sp} fields={["q", "date", "stage", "owner", "team", "source", "campaign", "category", "city", "priority", "conversion"]} keep={["reactivation", "sort"]} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Saved views:</span>
        {views.map((v) => (
          <span key={v.id} className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 ring-1 ring-slate-200">
            <Link className="link" href={`/leads?${v.query}`}>{v.name}</Link>
            <form action={saveView}><input type="hidden" name="delete" value={v.id} /><button className="text-slate-400 hover:text-red-600" aria-label={`Delete view ${v.name}`}>×</button></form>
          </span>
        ))}
        {query && (
          <form action={saveView} className="flex gap-1">
            <input type="hidden" name="query" value={query} />
            <input name="name" placeholder="Save current filters as…" className="input w-48 py-1" required />
            <button className="btn-ghost py-1">Save view</button>
          </form>
        )}
        <span className="ml-auto text-slate-500">Sort:</span>
        {Object.keys(SORTS).map((k) => (
          <Link key={k} href={`?${filterQuery(sp, { sort: k })}`} className={str(sp.sort) === k || (!str(sp.sort) && k === "new") ? "font-semibold" : "link"}>{k}</Link>
        ))}
      </div>

      <BulkTable rows={rows} users={users} stages={stages}
        perms={{ assign: can(u, "lead.assign"), edit: can(u, "lead.edit"), del: can(u, "lead.delete") }} priorities={priorities} />
      <Pager page={page} total={total} perPage={PER_PAGE} query={query} />
    </>
  );
}
