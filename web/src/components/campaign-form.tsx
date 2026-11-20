import { saveCampaign } from "@/app/(app)/actions";
import type { Row } from "@/lib/db";
import { CHANNELS } from "@/lib/leads";

export function CampaignForm({ c = {}, users }: { c?: Row; users: Row[] }) {
  return (
    <form action={saveCampaign} className="mt-3 grid gap-3 sm:grid-cols-3">
      {c.id && <input type="hidden" name="id" value={c.id} />}
      <div><label className="label" htmlFor="c-name">Name *</label><input id="c-name" name="name" required defaultValue={c.name} className="input" /></div>
      <div><label className="label" htmlFor="c-type">Type</label><input id="c-type" name="type" defaultValue={c.type ?? ""} className="input" placeholder="Lead gen, awareness…" /></div>
      <div><label className="label" htmlFor="c-channel">Channel</label>
        <select id="c-channel" name="channel" defaultValue={c.channel ?? "Facebook Ads"} className="input">{CHANNELS.map((x) => <option key={x}>{x}</option>)}</select></div>
      <div><label className="label" htmlFor="c-cat">Category / vertical</label><input id="c-cat" name="category" defaultValue={c.category ?? ""} className="input" /></div>
      <div><label className="label" htmlFor="c-start">Start</label><input id="c-start" type="date" name="start_date" defaultValue={c.start_date ?? ""} className="input" /></div>
      <div><label className="label" htmlFor="c-end">End</label><input id="c-end" type="date" name="end_date" defaultValue={c.end_date ?? ""} className="input" /></div>
      <div><label className="label" htmlFor="c-budget">Budget (₹)</label><input id="c-budget" type="number" name="budget" min="0" step="0.01" defaultValue={c.budget ?? ""} className="input" /></div>
      <div><label className="label" htmlFor="c-aud">Target audience</label><input id="c-aud" name="target_audience" defaultValue={c.target_audience ?? ""} className="input" /></div>
      <div><label className="label" htmlFor="c-obj">Objective</label><input id="c-obj" name="objective" defaultValue={c.objective ?? ""} className="input" /></div>
      <div><label className="label" htmlFor="c-owner">Owner</label>
        <select id="c-owner" name="owner_id" defaultValue={c.owner_id ?? ""} className="input"><option value="">—</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      <div><label className="label" htmlFor="c-status">Status</label>
        <select id="c-status" name="status" defaultValue={c.status ?? "active"} className="input">{["draft", "active", "paused", "completed"].map((x) => <option key={x}>{x}</option>)}</select></div>
      <div className="flex items-end"><button className="btn">Save campaign</button></div>
    </form>
  );
}
