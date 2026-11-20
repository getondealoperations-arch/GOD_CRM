import { exec, getSetting } from "@/lib/db";
import { processLeadgen, verifySignature } from "@/lib/meta";

// Meta webhook subscription verification
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const token = await getSetting("meta_verify_token");
  if (p.get("hub.mode") === "subscribe" && token && p.get("hub.verify_token") === token) return new Response(p.get("hub.challenge") ?? "");
  return new Response("Forbidden", { status: 403 });
}

// Lead Ads "leadgen" events. Failures are recorded in meta_sync_logs and retried by the automation loop.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifySignature(raw, req.headers.get("x-hub-signature-256")))) {
    await exec("INSERT INTO meta_sync_logs (status, payload, error) VALUES ('failed', ?, 'Invalid or missing signature')", [raw.slice(0, 5000)]);
    return new Response("Invalid signature", { status: 401 });
  }
  let body;
  try { body = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
  for (const entry of body.entry ?? [])
    for (const ch of entry.changes ?? [])
      if (ch.field === "leadgen" && ch.value?.leadgen_id) await processLeadgen(String(ch.value.leadgen_id), ch.value);
  return new Response("EVENT_RECEIVED");
}
