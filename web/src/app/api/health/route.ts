import { getSetting, one } from "@/lib/db";

/** Uptime/monitoring probe (SRS §18). 200 = healthy, 503 = degraded. No secrets, no personal data. */
export async function GET() {
  const checks: Record<string, unknown> = {};
  let ok = true;
  try { await one("SELECT 1"); checks.database = "ok"; } catch (e) { checks.database = (e as Error).message; ok = false; }
  if (checks.database === "ok") {
    const last = await getSetting("automation_last_run");
    const age = last ? Math.round((Date.now() - Date.parse(last)) / 1000) : null;
    checks.automation = { lastRun: last || null, secondsAgo: age };
    if (process.env.AUTOMATION !== "off" && (age == null || age > 300)) ok = false;
    const j = await one("SELECT SUM(status='queued') queued, SUM(status='running') running, SUM(status='failed' AND created_at > NOW() - INTERVAL 1 DAY) failed24h FROM jobs");
    checks.jobs = { queued: Number(j?.queued ?? 0), running: Number(j?.running ?? 0), failed24h: Number(j?.failed24h ?? 0) };
    const m = await one("SELECT COUNT(*) c FROM meta_sync_logs WHERE status='failed' AND attempts>=5");
    checks.metaUnrecoverable = Number(m?.c ?? 0);
    checks.errorsLastHour = Number((await one("SELECT COUNT(*) c FROM error_logs WHERE created_at > NOW() - INTERVAL 1 HOUR"))?.c ?? 0);
  }
  return Response.json({ status: ok ? "ok" : "degraded", time: new Date().toISOString(), checks }, { status: ok ? 200 : 503 });
}
