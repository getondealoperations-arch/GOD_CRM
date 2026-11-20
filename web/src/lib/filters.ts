import { leadScope, type User } from "./auth";

export type SP = Record<string, string | string[] | undefined>;
export const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

/**
 * One WHERE builder for leads (alias `l`), shared by list, dashboard, export and reports,
 * so every view applies the same filters and the same permission scope.
 */
export function leadWhere(u: User, sp: SP) {
  const scope = leadScope(u);
  const w: string[] = [scope.sql];
  const p: (string | number)[] = [...scope.params];
  const add = (sql: string, ...v: (string | number)[]) => { w.push(sql); p.push(...v); };

  const s = str(sp.q);
  if (s) {
    const like = `%${s}%`;
    add("(l.name LIKE ? OR l.mobile LIKE ? OR l.business_name LIKE ? OR l.lead_code LIKE ? OR l.email LIKE ? OR l.campaign_name LIKE ?)",
      like, like, like, like, like, like);
  }
  if (str(sp.stage)) add("l.stage_id=?", Number(str(sp.stage)));
  if (str(sp.owner) === "none") w.push("l.owner_id IS NULL");
  else if (str(sp.owner)) add("l.owner_id=?", Number(str(sp.owner)));
  if (str(sp.team)) add("l.owner_id IN (SELECT id FROM users WHERE team_id=?)", Number(str(sp.team)));
  if (str(sp.source)) add("l.source=?", str(sp.source));
  if (str(sp.campaign)) add("l.campaign_id=?", Number(str(sp.campaign)));
  if (str(sp.category)) add("l.category=?", str(sp.category));
  if (str(sp.city)) add("l.city=?", str(sp.city));
  if (str(sp.priority)) add("l.priority=?", str(sp.priority));
  if (str(sp.tag)) add("FIND_IN_SET(?, REPLACE(l.tags,', ',','))", str(sp.tag));
  if (str(sp.from)) add("l.created_at>=?", str(sp.from));
  if (str(sp.to)) add("l.created_at<DATE_ADD(?, INTERVAL 1 DAY)", str(sp.to));
  if (str(sp.conversion) === "converted") w.push("l.stage_id IN (SELECT id FROM stages WHERE is_won=1)");
  if (str(sp.conversion) === "lost") w.push("l.stage_id IN (SELECT id FROM stages WHERE is_lost=1)");
  if (str(sp.conversion) === "open") w.push("l.stage_id IN (SELECT id FROM stages WHERE is_won=0 AND is_lost=0)");
  if (str(sp.reactivation) === "1") w.push("l.in_reactivation=1");
  return { where: w.join(" AND "), params: p };
}

/** Keep only filter keys, for building links (drill-down, export, pagination). */
export const FILTER_KEYS = ["q", "stage", "owner", "team", "source", "campaign", "category", "city", "priority", "tag", "from", "to", "conversion", "reactivation"];
export function filterQuery(sp: SP, extra: Record<string, string | number> = {}) {
  const u = new URLSearchParams();
  for (const k of FILTER_KEYS) if (str(sp[k])) u.set(k, str(sp[k]));
  for (const [k, v] of Object.entries(extra)) u.set(k, String(v));
  return u.toString();
}
