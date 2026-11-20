import { audit, exec, q } from "./db";
import { activity, addTouch, createLead, findDuplicate, getPriorities, normMobile, validEmail, validMobile } from "./leads";

export type ImportResult = { total: number; success: number; updated: number; skipped: number; failed: number; failedRows: Record<string, string>[] };

/** Validate (mode "validate") or import (mode "import") parsed sheet rows. Shared by the request path and the background job. */
export async function importRows(o: {
  rows: Record<string, string>[]; mapping: Record<string, string>; dupMode: string; mode: "validate" | "import";
  userId: number; fileName: string; onProgress?: (done: number) => Promise<void>;
}): Promise<ImportResult> {
  const { rows, mapping, dupMode, mode, userId } = o;
  const campaigns = new Map((await q("SELECT id, LOWER(name) n, channel FROM campaigns")).map((c) => [c.n, c]));
  const owners = new Map((await q("SELECT id, LOWER(email) e FROM users WHERE active=1")).map((x) => [x.e, x.id]));
  const priorities = await getPriorities();
  const seen = new Set<string>();
  const result: ImportResult = { total: rows.length, success: 0, updated: 0, skipped: 0, failed: 0, failedRows: [] };

  for (const [i, raw] of rows.entries()) {
    if (o.onProgress && i % 100 === 0) await o.onProgress(i);
    const r: Record<string, string> = {};
    for (const [h, f] of Object.entries(mapping)) if (f) r[f] = String(raw[h] ?? "").trim();
    const errors: string[] = [];
    const mobile = normMobile(r.mobile);
    if (!r.name) errors.push("Name missing");
    if (!validMobile(mobile)) errors.push("Invalid mobile");
    if (!validEmail(r.email ?? "")) errors.push("Invalid email");
    if (r.priority && !priorities.includes(r.priority.toLowerCase())) errors.push(`Unknown priority (use ${priorities.join("/")})`);
    if (r.owner_email && !owners.has(r.owner_email.toLowerCase())) errors.push("Owner email not found");
    if (r.created_at && Number.isNaN(Date.parse(r.created_at.replace(" ", "T")))) errors.push("Bad created_at date");
    if (mobile && seen.has(mobile)) errors.push("Duplicate within file");
    if (errors.length) { result.failed++; result.failedRows.push({ row: String(i + 2), ...raw, error: errors.join("; ") }); continue; }
    seen.add(mobile);

    const dup = dupMode === "allow" ? undefined : await findDuplicate(mobile, r.email);
    if (dup && dupMode === "skip") { result.skipped++; result.failedRows.push({ row: String(i + 2), ...raw, error: `Skipped: duplicate of ${dup.lead_code}` }); continue; }
    if (mode === "validate") { if (dup) result.updated++; else result.success++; continue; }

    const camp = r.campaign ? campaigns.get(r.campaign.toLowerCase()) : undefined;
    try {
      if (dup && dupMode === "update") {
        const fields = ["email", "business_name", "category", "city", "remarks", "tags", "alt_mobile"].filter((k) => r[k]);
        if (fields.length) await exec(`UPDATE leads SET ${fields.map((k) => `${k}=?`).join(",")} WHERE id=?`, [...fields.map((k) => r[k]), dup.id]);
        await activity(dup.id, userId, "edit", `Updated from import (${o.fileName}): ${fields.join(", ") || "no changes"}`);
        if (camp || r.source) await addTouch(dup.id, { campaign_id: camp?.id ?? null, source: r.source || "Import", channel: camp?.channel ?? r.channel, adset_name: r.adset_name, ad_name: r.ad_name });
        result.updated++;
      } else {
        await createLead({
          name: r.name, mobile, alt_mobile: r.alt_mobile, email: r.email, business_name: r.business_name, category: r.category, city: r.city,
          source: r.source || "Import", channel: camp?.channel ?? r.channel, campaign_id: camp?.id ?? null, campaign_name: r.campaign,
          adset_name: r.adset_name, ad_name: r.ad_name, form_name: r.form_name, priority: r.priority?.toLowerCase(), remarks: r.remarks, tags: r.tags,
          owner_id: r.owner_email ? owners.get(r.owner_email.toLowerCase()) : null,
          created_at: r.created_at ? r.created_at.replace("T", " ").slice(0, 19) : undefined,
        }, userId);
        result.success++;
      }
    } catch (e) {
      result.failed++;
      result.failedRows.push({ row: String(i + 2), ...raw, error: (e as Error).message });
    }
  }
  if (mode === "import") await audit(userId, "import", "lead", null, { file: o.fileName, ...result, failedRows: result.failedRows.length });
  return result;
}
