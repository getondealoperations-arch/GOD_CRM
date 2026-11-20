// Outbound/inbound messaging channels (SRS §15 notification channels, Phase 3 WhatsApp automation).
// Every channel is a no-op until configured in Settings → Notifications & channels.
import nodemailer from "nodemailer";
import { decrypt } from "./auth";
import { exec, getSetting, logError, notify, one } from "./db";
import { activity, createLead, normMobile } from "./leads";

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}`;
const intl = (m: string) => { const d = normMobile(m); return d.length === 10 ? "91" + d : d; };

async function logMessage(m: { channel: string; to: string; body: string; status: string; error?: string; lead_id?: number | null; user_id?: number | null; provider_id?: string; direction?: string }) {
  await exec("INSERT INTO message_logs (channel,direction,to_addr,lead_id,user_id,body,status,error,provider_id) VALUES (?,?,?,?,?,?,?,?,?)",
    [m.channel, m.direction ?? "out", m.to, m.lead_id ?? null, m.user_id ?? null, m.body.slice(0, 5000), m.status, m.error ?? null, m.provider_id ?? null]);
}

export async function appUrl() {
  return (process.env.APP_URL || (await getSetting("app_url")) || "http://localhost:3000").replace(/\/$/, "");
}

// ---------- Email (SMTP) ----------
export async function sendEmail(to: string, subject: string, text: string, meta: { lead_id?: number; user_id?: number } = {}) {
  const host = await getSetting("smtp_host");
  if (!host || !to) return false;
  try {
    const t = nodemailer.createTransport({
      host, port: Number(await getSetting("smtp_port", "587")), secure: (await getSetting("smtp_port")) === "465",
      auth: (await getSetting("smtp_user")) ? { user: await getSetting("smtp_user"), pass: decrypt(await getSetting("smtp_pass")) } : undefined,
    });
    const r = await t.sendMail({ from: (await getSetting("smtp_from")) || (await getSetting("smtp_user")), to, subject, text });
    await logMessage({ channel: "email", to, body: subject, status: "sent", provider_id: r.messageId, ...meta });
    return true;
  } catch (e) {
    await logMessage({ channel: "email", to, body: subject, status: "failed", error: (e as Error).message, ...meta });
    return false;
  }
}

// ---------- SMS (any HTTP gateway: MSG91, Twilio, Gupshup… via a webhook URL) ----------
export async function sendSms(to: string, message: string, meta: { lead_id?: number; user_id?: number } = {}) {
  const url = await getSetting("sms_webhook_url");
  if (!url || !to) return false;
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: intl(to), message }) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await logMessage({ channel: "sms", to, body: message, status: "sent", ...meta });
    return true;
  } catch (e) {
    await logMessage({ channel: "sms", to, body: message, status: "failed", error: (e as Error).message, ...meta });
    return false;
  }
}

// ---------- WhatsApp Cloud API ----------
export async function waConfigured() {
  return !!((await getSetting("wa_token")) && (await getSetting("wa_phone_id")));
}

/** Send a WhatsApp message: an approved template (works any time) or free text (only inside Meta's 24-hour reply window). */
export async function sendWhatsApp(to: string, msg: { template?: string; params?: string[]; text?: string }, meta: { lead_id?: number; user_id?: number } = {}) {
  if (!(await waConfigured()) || !to) return { ok: false, error: "WhatsApp is not configured" };
  const body = msg.template
    ? { type: "template", template: { name: msg.template, language: { code: (await getSetting("wa_template_lang")) || "en" },
        components: msg.params?.length ? [{ type: "body", parameters: msg.params.map((text) => ({ type: "text", text })) }] : [] } }
    : { type: "text", text: { body: msg.text ?? "" } };
  const label = msg.template ? `[template ${msg.template}] ${msg.params?.join(" | ") ?? ""}` : msg.text ?? "";
  try {
    const r = await fetch(`${GRAPH}/${await getSetting("wa_phone_id")}/messages`, {
      method: "POST", headers: { authorization: `Bearer ${decrypt(await getSetting("wa_token"))}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: intl(to), ...body }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
    await logMessage({ channel: "whatsapp", to, body: label, status: "sent", provider_id: j.messages?.[0]?.id, ...meta });
    return { ok: true };
  } catch (e) {
    await logMessage({ channel: "whatsapp", to, body: label, status: "failed", error: (e as Error).message, ...meta });
    return { ok: false, error: (e as Error).message };
  }
}

/** May we message this lead on WhatsApp? Consent given, not DND, and WhatsApp allowed by their preference (if they set one). */
export const waAllowed = (l: { consent: number; dnd: number; comm_pref: string | null }) =>
  !!l.consent && !l.dnd && (!l.comm_pref || l.comm_pref.split(",").includes("whatsapp"));

export async function whatsappWelcome(leadId: number) {
  const tpl = await getSetting("wa_welcome_template");
  const l = await one("SELECT id, name, mobile, consent, dnd, comm_pref FROM leads WHERE id=?", [leadId]);
  if (!tpl || !l || !waAllowed(l as never)) return;
  const r = await sendWhatsApp(l.mobile, { template: tpl, params: [l.name] }, { lead_id: leadId });
  await activity(leadId, null, "message", r.ok ? `WhatsApp welcome template "${tpl}" sent` : `WhatsApp welcome failed: ${r.error}`);
}

/** Inbound WhatsApp message → lead timeline (new number → new lead with source WhatsApp) + notify owner. */
export async function receiveWhatsApp(from: string, text: string, name: string, providerId: string) {
  const mobile = normMobile(from);
  let lead = await one("SELECT id, owner_id, name FROM leads WHERE mobile=? OR alt_mobile=? ORDER BY id LIMIT 1", [mobile, mobile]);
  if (!lead) {
    const id = await createLead({ name: name || "WhatsApp enquiry", mobile, source: "WhatsApp", channel: "WhatsApp", remarks: text, comm_pref: "whatsapp" }, null);
    lead = await one("SELECT id, owner_id, name FROM leads WHERE id=?", [id]);
  }
  await logMessage({ channel: "whatsapp", direction: "in", to: mobile, body: text, status: "received", lead_id: lead!.id, provider_id: providerId });
  await activity(lead!.id, null, "message", `WhatsApp from customer: ${text}`);
  await exec("UPDATE leads SET last_contact_at=NOW(), in_reactivation=0 WHERE id=?", [lead!.id]);
  if (lead!.owner_id) await notify(lead!.owner_id, `WhatsApp reply from ${lead!.name}`, `/leads/${lead!.id}`);
}

export async function waStatus(providerId: string, status: string) {
  await exec("UPDATE message_logs SET status=? WHERE provider_id=? AND channel='whatsapp'", [status, providerId]);
}

// ---------- Employee notification fan-out ----------
/** Sends a notification on each channel the user opted into (users.notify_channels), if that channel is configured. */
export async function deliver(userId: number, title: string, link?: string) {
  const u = await one("SELECT email, phone, notify_channels FROM users WHERE id=? AND active=1", [userId]);
  const chans = String(u?.notify_channels ?? "").split(",").filter(Boolean);
  if (!u || !chans.length) return;
  const url = link ? (await appUrl()) + link : "";
  try {
    if (chans.includes("email")) await sendEmail(u.email, `[GetOnDeal CRM] ${title}`, `${title}\n\n${url}`, { user_id: userId });
    if (chans.includes("whatsapp") && u.phone) {
      const tpl = await getSetting("wa_notify_template");
      if (tpl) await sendWhatsApp(u.phone, { template: tpl, params: [title] }, { user_id: userId });
    }
    if (chans.includes("sms") && u.phone) await sendSms(u.phone, `${title} ${url}`.trim(), { user_id: userId });
  } catch (e) { await logError("deliver", e, { userId, title }); }
}
