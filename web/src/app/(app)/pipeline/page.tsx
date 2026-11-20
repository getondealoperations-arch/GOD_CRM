import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { filterQuery, leadWhere, type SP } from "@/lib/filters";
import { FilterBar } from "@/components/filter-bar";
import { Kanban } from "@/components/kanban";
import { dur } from "@/components/ui";

const PER_COLUMN = 60; // ponytail: cap cards per column; "+N more" links to the filtered list view

export default async function Pipeline({ searchParams }: PageProps<"/pipeline">) {
  const u = await requireUser();
  const sp = (await searchParams) as SP;
  const w = leadWhere(u, sp);
  const stages = await q(
    `SELECT s.*, COUNT(l.id) total, SUM(l.expected_revenue) value,
       (SELECT AVG(h.seconds_in_prev) FROM stage_history h WHERE h.from_stage_id=s.id) avg_sec
     FROM stages s LEFT JOIN leads l ON l.stage_id=s.id AND ${w.where} GROUP BY s.id ORDER BY s.position`, w.params);
  const cards = (await Promise.all(stages.map((s) => q(
    `SELECT l.id, l.name, l.mobile, l.business_name, l.stage_id, ou.name owner, DATEDIFF(NOW(), l.stage_changed_at) days_in_stage
     FROM leads l LEFT JOIN users ou ON ou.id=l.owner_id WHERE l.stage_id=? AND ${w.where}
     ORDER BY l.score DESC, l.stage_changed_at LIMIT ?`, [s.id, ...w.params, PER_COLUMN])))).flat();
  for (const s of stages) s.avg_time = s.avg_sec ? dur(Number(s.avg_sec)) : "";

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="h1">Sales pipeline</h1>
        <Link href={`/leads?${filterQuery(sp)}`} className="btn-ghost">List view</Link>
      </div>
      <FilterBar sp={sp} fields={["q", "owner", "team", "campaign", "source", "category", "priority", "date"]} />
      <p className="text-xs text-slate-500">Drag cards between columns to change stage. Every move is recorded in stage history and the audit log.</p>
      <Kanban key={JSON.stringify(sp)} stages={stages} cards={cards} canEdit={can(u, "lead.edit")} />
    </>
  );
}
