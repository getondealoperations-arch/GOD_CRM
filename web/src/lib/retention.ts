// Data retention (SRS §17, DPDP): purge operational logs after a set period and, optionally, anonymise
// long-closed Lost leads. Anonymisation keeps the row (so reports and counts stay true) but erases personal data.
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { audit, exec, getSetting, q } from "./db";
import { STORAGE } from "./jobs";

/** Erase a lead's personal data in place (right to erasure). Counts, stages, sales amounts stay for reporting. */
export async function anonymizeLead(id: number, actorId: number | null) {
  await exec(`UPDATE leads SET name='(anonymised)', mobile='', alt_mobile=NULL, email=NULL, business_name=NULL, remarks=NULL, tags=NULL,
    meta_lead_id=NULL, anonymized_at=NOW() WHERE id=?`, [id]);
  await exec("UPDATE lead_activities SET message='[redacted]' WHERE lead_id=? AND type IN ('note','edit','call','message','followup')", [id]);
  await exec("UPDATE calls SET remarks=NULL, recording_url=NULL WHERE lead_id=?", [id]);
  await exec("UPDATE followups SET note=NULL, outcome=NULL WHERE lead_id=?", [id]);
  await exec("UPDATE message_logs SET body=NULL, to_addr=NULL WHERE lead_id=?", [id]);
  await exec("INSERT INTO lead_activities (lead_id,user_id,type,message) VALUES (?,?,'system','Personal data anonymised')", [id, actorId]);
  await audit(actorId, "anonymise", "lead", id);
}

export async function runRetention() {
  const days = (k: string, d: string) => getSetting(k, d).then(Number);
  const notif = await days("retention_notifications_days", "90"), logs = await days("retention_logs_days", "180");
  const out: Record<string, number> = {};
  out.notifications = (await exec("DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < NOW() - INTERVAL ? DAY", [notif])).affectedRows;
  for (const t of ["meta_sync_logs", "error_logs", "message_logs"])
    out[t] = (await exec(`DELETE FROM ${t} WHERE created_at < NOW() - INTERVAL ? DAY ${t === "meta_sync_logs" ? "AND status<>'failed'" : ""}`, [logs])).affectedRows;
  out.jobs = (await exec("DELETE FROM jobs WHERE status IN ('done','failed') AND created_at < NOW() - INTERVAL 30 DAY")).affectedRows;
  for (const dir of ["uploads", "exports"]) {
    // runtime folder (STORAGE_DIR) — not part of the build, so excluded from Turbopack's file tracing
    const p = path.join(/*turbopackIgnore: true*/ STORAGE, dir);
    for (const f of await readdir(/*turbopackIgnore: true*/ p).catch(() => [] as string[])) {
      const file = path.join(/*turbopackIgnore: true*/ p, f);
      if ((await stat(/*turbopackIgnore: true*/ file)).mtimeMs < Date.now() - (dir === "uploads" ? 7 : 30) * 864e5) await unlink(/*turbopackIgnore: true*/ file);
    }
  }
  const months = await days("retention_lost_months", "0");
  if (months > 0) {
    const rows = await q<{ id: number }>(`SELECT l.id FROM leads l JOIN stages s ON s.id=l.stage_id
      WHERE s.is_lost=1 AND l.anonymized_at IS NULL AND l.stage_changed_at < NOW() - INTERVAL ? MONTH LIMIT 1000`, [months]);
    for (const r of rows) await anonymizeLead(r.id, null);
    out.anonymised = rows.length;
  }
  return out;
}
