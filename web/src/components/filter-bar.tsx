import { getPriorities } from "@/lib/leads";
import Link from "next/link";
import { q } from "@/lib/db";
import { str, type SP } from "@/lib/filters";
import { FilterToggle } from "@/components/filter-toggle";

type Field = "date" | "campaign" | "source" | "category" | "city" | "team" | "owner" | "stage" | "priority" | "q" | "conversion";
type Opt = { id: string | number; name: string };

export async function FilterBar({ sp, fields, keep = [] }: { sp: SP; fields: Field[]; keep?: string[] }) {
  const has = (f: Field) => fields.includes(f);
  const none = Promise.resolve([]);
  const [campaigns, sources, categories, cities, teams, users, stages] = await Promise.all([
    has("campaign") ? q("SELECT id, name FROM campaigns ORDER BY name") : none,
    has("source") ? q("SELECT DISTINCT source id, source name FROM leads ORDER BY source") : none,
    has("category") ? q("SELECT DISTINCT category id, category name FROM leads WHERE category IS NOT NULL AND category<>'' ORDER BY category") : none,
    has("city") ? q("SELECT DISTINCT city id, city name FROM leads WHERE city IS NOT NULL AND city<>'' ORDER BY city") : none,
    has("team") ? q("SELECT id, name FROM teams ORDER BY name") : none,
    has("owner") ? q("SELECT id, name FROM users WHERE active=1 ORDER BY name") : none,
    has("stage") ? q("SELECT id, name FROM stages ORDER BY position") : none,
  ]) as Opt[][];
  const priorities = has("priority") ? await getPriorities() : [];
  const v = (k: string) => str(sp[k]);
  const sel = (name: string, label: string, opts: Opt[], extra?: React.ReactNode) => (
    <div>
      <label className="label" htmlFor={`f-${name}`}>{label}</label>
      <select id={`f-${name}`} name={name} defaultValue={v(name)} className="input">
        <option value="">All</option>{extra}
        {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );

  const active = ["q", "campaign", "source", "category", "city", "team", "owner", "stage", "priority", "conversion"].filter((k) => v(k)).length;

  return (
    <FilterToggle active={active}>
    <form className="card grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-8">
      {keep.map((k) => v(k) && <input key={k} type="hidden" name={k} value={v(k)} />)}
      {has("q") && <div className="col-span-2"><label className="label" htmlFor="f-q">Search</label><input id="f-q" name="q" defaultValue={v("q")} className="input" placeholder="Name, mobile, business, ID" /></div>}
      {has("date") && <>
        <div><label className="label" htmlFor="f-from">From</label><input id="f-from" type="date" name="from" defaultValue={v("from")} className="input" /></div>
        <div><label className="label" htmlFor="f-to">To</label><input id="f-to" type="date" name="to" defaultValue={v("to")} className="input" /></div>
      </>}
      {has("campaign") && sel("campaign", "Campaign", campaigns)}
      {has("source") && sel("source", "Source", sources)}
      {has("category") && sel("category", "Category / vertical", categories)}
      {has("city") && sel("city", "City", cities)}
      {has("team") && sel("team", "Team", teams)}
      {has("owner") && sel("owner", "Employee", users, <option value="none">Unassigned</option>)}
      {has("stage") && sel("stage", "Status / stage", stages)}
      {has("priority") && sel("priority", "Priority", priorities.map((p) => ({ id: p, name: p })))}
      {has("conversion") && sel("conversion", "Conversion", [{ id: "open", name: "Open" }, { id: "converted", name: "Converted" }, { id: "lost", name: "Lost" }])}
      <div className="flex items-end gap-2">
        <button className="btn">Apply</button>
        <Link href={keep.length ? `?${keep.filter(v).map((k) => `${k}=${encodeURIComponent(v(k))}`).join("&")}` : "?"} className="btn-ghost">Reset</Link>
      </div>
    </form>
    </FilterToggle>
  );
}
