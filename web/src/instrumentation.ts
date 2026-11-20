import type { Instrumentation } from "next";

// Background automation loop (SRS §15, §18).
// ponytail: in-process interval, fine for a single server; with multiple instances, set
// AUTOMATION=off and call POST /api/cron from one scheduler instead.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.AUTOMATION === "off") return;
  const g = globalThis as unknown as { _automation?: boolean };
  if (g._automation) return;
  g._automation = true;
  const { runAutomation } = await import("./lib/automation");
  const { recoverInterrupted, kick } = await import("./lib/jobs");
  await recoverInterrupted().catch(() => {});
  void kick();
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try { await runAutomation(); } catch (e) { console.error("[automation]", (e as Error).message); } finally { running = false; }
  }, 60_000);
}

/** Server errors → error_logs (Settings → System health). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const message = err instanceof Error ? err.message : String(err);
  if (/^(Forbidden|NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR)/.test(message)) return; // expected control flow, not faults
  const { logError } = await import("./lib/db");
  await logError("request", err, { path: request.path, method: request.method, route: context.routePath, digest: (err as { digest?: string }).digest });
};
