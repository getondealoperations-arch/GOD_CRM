import { exec, getSetting, logError, notify, q, setSetting } from "./db";
import { activity, assignLead, pickAssignee, ruleOn } from "./leads";
import { reconcile, retryFailed, syncAdSpend } from "./meta";

async function supervisorOf(userId: number | null): Promise<number[]> {
  if (!userId) return (await q<{ id: number }>("SELECT id FROM users WHERE role IN ('admin','super_admin') AND active=1")).map((r) => r.id);
  const r = await q<{ id: number | null }>(
    `SELECT COALESCE(NULLIF(t.leader_id, u.id), u.manager_id) id FROM users u LEFT JOIN teams t ON t.id=u.team_id WHERE u.id=?`, [userId]);
  return r[0]?.id ? [r[0].id] : [];
}

function inWorkingHours(start: string, end: string, now = new Date()) {
  const hm = now.toTimeString().slice(0, 5);
  return hm >= start && hm < end;
}

/** Periodic task gate stored in settings, so intervals survive restarts and are shared by instances. */
async function due(task: string, everyMs: number) {
  const last = Number(await getSetting(`last_${task}`, "0"));
  if (Date.now() - last < everyMs) return false;
  await setSetting(`last_${task}`, String(Date.now()));
  return true;
}
/** Once per day, at or after HH:MM local time. */
async function dailyAt(task: string, hm: string) {
  const today = new Date().toDateString();
  if (new Date().toTimeString().slice(0, 5) < hm || (await getSetting(`last_${task}`)) === today) return false;
  await setSetting(`last_${task}`, today);
  return true;
}

/** SRS §15 rules + scheduled maintenance. Each step is isolated: one failing step is logged and the rest still run. */
export async function runAutomation() {
  const out: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try { out[name] = await fn(); } catch (e) { out[name] = "error"; await logError(`automation:${name}`, e); }
  };
  const working = inWorkingHours(await getSetting("work_start", "09:00"), await getSetting("work_end", "20:00"));
  const sla = Number(await getSetting("sla_minutes", "15"));
  const escalateAfter = Number(await getSetting("escalate_after_minutes", "60"));
  const inactiveDays = Number(await getSetting("inactivity_days", "7"));

  if (working && (await ruleOn("sla"))) await step("sla", async () => {
    // Lead not contacted within SLA → alert team leader
    const late = await q(
      `SELECT l.id, l.name, l.owner_id FROM leads l JOIN stages s ON s.id=l.stage_id
       WHERE l.sla_alerted=0 AND l.total_calls=0 AND s.is_won=0 AND s.is_lost=0
         AND COALESCE(l.assigned_at, l.created_at) < NOW() - INTERVAL ? MINUTE
         AND l.created_at > NOW() - INTERVAL 2 DAY LIMIT 200`, [sla]);
    for (const l of late) {
      for (const s of await supervisorOf(l.owner_id)) await notify(s, `SLA breach: ${l.name} not contacted within ${sla} min`, `/leads/${l.id}`);
      await exec("UPDATE leads SET sla_alerted=1 WHERE id=?", [l.id]);
    }
    return late.length;
  });

  if (working && (await ruleOn("reminders"))) await step("reminders", async () => {
    // Follow-up due soon → remind owner
    const due = await q(
      `SELECT f.id, f.assigned_to, f.lead_id, l.name FROM followups f JOIN leads l ON l.id=f.lead_id
       WHERE f.status='pending' AND f.reminded=0 AND f.due_at <= NOW() + INTERVAL 15 MINUTE LIMIT 500`);
    for (const f of due) {
      await notify(f.assigned_to, `Follow-up due: ${f.name}`, `/leads/${f.lead_id}`);
      await exec("UPDATE followups SET reminded=1 WHERE id=?", [f.id]);
    }
    return due.length;
  });

  if (working && (await ruleOn("escalation"))) await step("escalations", async () => {
    // Overdue follow-up → escalate to team leader / manager
    const overdue = await q(
      `SELECT f.id, f.assigned_to, f.lead_id, l.name FROM followups f JOIN leads l ON l.id=f.lead_id
       WHERE f.status='pending' AND f.escalated=0 AND f.due_at < NOW() - INTERVAL ? MINUTE LIMIT 500`, [escalateAfter]);
    for (const f of overdue) {
      for (const s of await supervisorOf(f.assigned_to)) await notify(s, `Overdue follow-up escalated: ${f.name}`, `/leads/${f.lead_id}`);
      await exec("UPDATE followups SET escalated=1 WHERE id=?", [f.id]);
      await activity(f.lead_id, null, "followup", "Overdue follow-up escalated to supervisor");
    }
    return overdue.length;
  });

  if (await ruleOn("reactivation")) await step("reactivated", async () => {
    // Inactive open lead → reactivation queue
    const inactive = await q<{ id: number }>(
      `SELECT l.id FROM leads l JOIN stages s ON s.id=l.stage_id
       WHERE l.in_reactivation=0 AND s.is_won=0 AND s.is_lost=0 AND l.anonymized_at IS NULL
         AND COALESCE(l.last_contact_at, l.created_at) < NOW() - INTERVAL ? DAY
         AND NOT EXISTS (SELECT 1 FROM followups f WHERE f.lead_id=l.id AND f.status='pending') LIMIT 500`, [inactiveDays]);
    for (const l of inactive) {
      await exec("UPDATE leads SET in_reactivation=1 WHERE id=?", [l.id]);
      await activity(l.id, null, "system", `No activity for ${inactiveDays} days — moved to reactivation queue`);
    }
    return inactive.length;
  });

  // SRS §10: leads not yet contacted, owned by someone unavailable/inactive → redistribute (round robin / rules)
  if ((await getSetting("reassign_unavailable", "1")) === "1" && (await getSetting("assign_mode", "round_robin")) !== "manual")
    await step("reassigned", async () => {
      const stuck = await q(
        `SELECT l.id, l.source, l.campaign_id, l.category FROM leads l JOIN stages s ON s.id=l.stage_id JOIN users u ON u.id=l.owner_id
         WHERE (u.active=0 OR u.available=0) AND l.total_calls=0 AND s.is_won=0 AND s.is_lost=0 LIMIT 200`);
      let n = 0;
      for (const l of stuck) {
        const to = await pickAssignee(l);
        if (!to) break; // nobody has capacity; try again next minute
        await assignLead(l.id, to, null);
        await activity(l.id, null, "system", "Reassigned automatically: previous owner unavailable");
        n++;
      }
      return n;
    });

  // Meta: retry failures every run, reconcile missed leads hourly, sync ad spend every 6 hours
  if (await getSetting("meta_access_token")) {
    await step("metaRetried", retryFailed);
    if (await due("meta_reconcile", 3600_000)) await step("metaReconciled", () => reconcile());
    if ((await getSetting("meta_ad_account_id")) && (await due("meta_spend", 6 * 3600_000))) await step("metaSpend", () => syncAdSpend(3));
  }

  if (await due("scoring", 3600_000)) await step("scoring", async () => (await import("./scoring")).recomputeScores());
  await step("jobs", async () => { void (await import("./jobs")).kick(); return "kicked"; });
  if ((await getSetting("backup_enabled")) === "1" && (await dailyAt("backup", await getSetting("backup_time", "02:00"))))
    await step("backup", async () => (await import("./backup")).runBackup());
  if (await dailyAt("retention", "03:00")) await step("retention", async () => (await import("./retention")).runRetention());

  await setSetting("automation_last_run", new Date().toISOString());
  return out;
}
