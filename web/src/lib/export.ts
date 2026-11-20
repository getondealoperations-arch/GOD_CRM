import type { User } from "./auth";
import { q } from "./db";
import { leadWhere, type SP } from "./filters";

export const LEAD_COLS = [
  ["lead_code", "Lead ID"], ["name", "Customer name"], ["mobile", "Mobile"], ["alt_mobile", "Alternate mobile"], ["email", "Email"],
  ["business_name", "Business name"], ["category", "Category"], ["city", "City"], ["source", "Source"], ["channel", "Channel"],
  ["campaign_name", "Campaign"], ["adset_name", "Ad set"], ["ad_name", "Ad"], ["form_name", "Form"], ["created_at", "Created at"],
  ["owner", "Assigned to"], ["priority", "Priority"], ["stage", "Status"], ["remarks", "Remarks"], ["tags", "Tags"],
  ["next_followup_at", "Next follow-up"], ["last_contact_at", "Last contact"], ["total_calls", "Total calls"],
  ["conversion_status", "Conversion status"], ["expected_revenue", "Expected revenue"], ["actual_revenue", "Actual revenue"], ["lost_reason", "Lost reason"],
  ["score", "Lead score"], ["win_prob", "Win probability %"], ["consent", "Consent"], ["dnd", "DND"], ["comm_pref", "Contact preference"],
].map(([key, label]) => ({ key, label }));

export const mask = (v: unknown, keep = 2) => { const s = String(v ?? ""); return s.length <= keep * 2 ? s : s.slice(0, keep) + "*".repeat(s.length - keep * 2) + s.slice(-keep); };

export async function leadExportRows(u: User, sp: SP, masked: boolean) {
  const w = leadWhere(u, sp);
  const rows = await q(
    `SELECT l.*, s.name stage, ou.name owner, CASE WHEN s.is_won THEN 'Converted' WHEN s.is_lost THEN 'Lost' ELSE 'Open' END conversion_status
     FROM leads l JOIN stages s ON s.id=l.stage_id LEFT JOIN users ou ON ou.id=l.owner_id WHERE ${w.where} ORDER BY l.id DESC`, w.params);
  if (masked) for (const r of rows) { r.mobile = mask(r.mobile); r.alt_mobile = r.alt_mobile ? mask(r.alt_mobile) : ""; r.email = r.email ? mask(r.email, 3) : ""; }
  return rows;
}
