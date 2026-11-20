import { getSetting, logError } from "@/lib/db";
import { receiveWhatsApp, waStatus } from "@/lib/channels";
import { verifySignature } from "@/lib/meta";

// WhatsApp Cloud API webhook: subscription check
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const token = await getSetting("wa_verify_token");
  if (p.get("hub.mode") === "subscribe" && token && p.get("hub.verify_token") === token) return new Response(p.get("hub.challenge") ?? "");
  return new Response("Forbidden", { status: 403 });
}

// Inbound messages and delivery statuses. Signed with the Meta app secret, like Lead Ads webhooks.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifySignature(raw, req.headers.get("x-hub-signature-256")))) return new Response("Invalid signature", { status: 401 });
  let body;
  try { body = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
  for (const entry of body.entry ?? [])
    for (const ch of entry.changes ?? []) {
      const v = ch.value ?? {};
      const names = new Map<string, string>((v.contacts ?? []).map((c: { wa_id: string; profile?: { name?: string } }) => [c.wa_id, c.profile?.name ?? ""]));
      for (const m of v.messages ?? []) {
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? `[${m.type}]`;
        try { await receiveWhatsApp(m.from, text, names.get(m.from) ?? "", m.id); } catch (e) { await logError("whatsapp_in", e, m); }
      }
      for (const st of v.statuses ?? []) await waStatus(st.id, st.status);
    }
  return new Response("EVENT_RECEIVED");
}
