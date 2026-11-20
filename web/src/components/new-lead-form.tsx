"use client";
import Link from "next/link";
import { useActionState } from "react";
import { createLeadAction, type FormState } from "@/app/(app)/actions";
import type { Row } from "@/lib/db";

const F = ({ label, name, type = "text", required, ...rest }: { label: string; name: string; type?: string; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div><label className="label" htmlFor={name}>{label}{required && " *"}</label><input id={name} name={name} type={type} required={required} className="input" {...rest} /></div>
);

export function NewLeadForm({ campaigns, users, canAssign, priorities }: { campaigns: Row[]; users: Row[]; canAssign: boolean; priorities: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createLeadAction, undefined);
  return (
    <form action={action} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {state?.error && (
        <div className="rounded bg-red-50 p-3 text-sm text-red-700 sm:col-span-2 lg:col-span-3">
          {state.error} {state.dupId && <>
            <Link className="link" href={`/leads/${state.dupId}`}>Open existing lead</Link>
            <label className="ml-3 inline-flex items-center gap-1"><input type="checkbox" name="force" value="1" /> Create anyway</label>
          </>}
        </div>
      )}
      <F label="Customer name" name="name" required />
      <F label="Mobile" name="mobile" type="tel" required inputMode="tel" />
      <F label="Alternate mobile" name="alt_mobile" type="tel" />
      <F label="Email" name="email" type="email" />
      <F label="Business name" name="business_name" />
      <F label="Category / vertical" name="category" />
      <F label="City / location" name="city" />
      <div><label className="label" htmlFor="source">Lead source</label>
        <select id="source" name="source" className="input" defaultValue="Manual">
          {["Manual", "Walk-in", "Referral", "Website", "WhatsApp", "Phone enquiry", "Event", "Google Ads", "Meta Lead Ads", "Other"].map((s) => <option key={s}>{s}</option>)}
        </select></div>
      <div><label className="label" htmlFor="campaign_id">Campaign</label>
        <select id="campaign_id" name="campaign_id" className="input"><option value="">—</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><label className="label" htmlFor="priority">Priority</label>
        <select id="priority" name="priority" className="input" defaultValue={priorities.includes("medium") ? "medium" : priorities[0]}>{priorities.map((p) => <option key={p}>{p}</option>)}</select></div>
      {canAssign && <div><label className="label" htmlFor="owner_id">Assign to</label>
        <select id="owner_id" name="owner_id" className="input"><option value="">Auto (distribution rules)</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>}
      <F label="Expected revenue (₹)" name="expected_revenue" type="number" min="0" />
      <F label="Tags (comma separated)" name="tags" />
      <div className="sm:col-span-2"><label className="label" htmlFor="remarks">Remarks</label><textarea id="remarks" name="remarks" className="input" rows={2} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="consent" defaultChecked /> Customer consented to be contacted</label>
      <fieldset className="text-sm sm:col-span-2"><legend className="label">Preferred contact (none = any)</legend>
        <div className="flex flex-wrap gap-3">{[["call", "Call"], ["whatsapp", "WhatsApp"], ["sms", "SMS"], ["email", "Email"]].map(([v, l]) => (
          <label key={v} className="flex items-center gap-1"><input type="checkbox" name="comm_pref" value={v} /> {l}</label>))}</div></fieldset>
      <div className="sm:col-span-2 lg:col-span-3"><button className="btn" disabled={pending}>{pending ? "Saving…" : "Create lead"}</button></div>
    </form>
  );
}
