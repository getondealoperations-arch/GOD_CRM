// Cloud telephony (SRS §7, Phase 3): Exotel click-to-call with recording + status callback.
// Flow: agent clicks Call → Exotel rings the agent's phone → on answer, dials the customer → after hang-up Exotel
// POSTs /api/telephony/callback with duration, status and recording URL, which completes the call row.
// ponytail: one provider (Exotel). Another provider = another startCall/parse pair behind the same two functions.
import { appUrl } from "./channels";
import { decrypt } from "./auth";
import { exec, getSetting, one } from "./db";
import { activity, normMobile } from "./leads";

export const PENDING = "In progress";

export async function telephonyEnabled() {
  return (await getSetting("tel_provider")) === "exotel" && !!(await getSetting("exotel_sid")) && !!(await getSetting("exotel_key"));
}

export async function clickToCall(leadId: number, user: { id: number }) {
  const agent = await one("SELECT phone FROM users WHERE id=?", [user.id]);
  if (!agent?.phone) throw new Error("Add your phone number in Team → your profile to use click-to-call");
  const lead = await one("SELECT mobile, dnd FROM leads WHERE id=?", [leadId]);
  if (!lead) throw new Error("Lead not found");
  const [sid, key, tok, host, callerId] = await Promise.all([getSetting("exotel_sid"), getSetting("exotel_key"),
    getSetting("exotel_token").then(decrypt), getSetting("exotel_subdomain", "api.exotel.com"), getSetting("exotel_callerid")]);
  const cb = `${await appUrl()}/api/telephony/callback?token=${await getSetting("tel_callback_token")}`;
  const body = new URLSearchParams({
    From: normMobile(agent.phone), To: normMobile(lead.mobile), CallerId: callerId, Record: "true",
    StatusCallback: cb, "StatusCallbackEvents[0]": "terminal", StatusCallbackContentType: "application/json", CustomField: String(leadId),
  });
  const r = await fetch(`https://${host}/v1/Accounts/${sid}/Calls/connect.json`, {
    method: "POST", body, headers: { authorization: "Basic " + Buffer.from(`${key}:${tok}`).toString("base64") },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.RestException?.Message ?? `Exotel error ${r.status}`);
  const res = await exec("INSERT INTO calls (lead_id,user_id,started_at,disposition,provider_call_id,call_status) VALUES (?,?,NOW(),?,?,'in-progress')",
    [leadId, user.id, PENDING, j.Call?.Sid ?? null]);
  return { callId: res.insertId, sid: j.Call?.Sid as string };
}

const AUTO_DISPO: Record<string, string> = { completed: "Connected", busy: "Busy", "no-answer": "Not Answered", failed: "Not Answered", canceled: "Not Answered" };

/** Apply Exotel's terminal status callback. If the agent has not saved a disposition yet, one is derived from the status. */
export async function applyCallback(p: Record<string, string>) {
  const sid = p.CallSid;
  const call = sid ? await one("SELECT * FROM calls WHERE provider_call_id=?", [sid]) : undefined;
  if (!call) return false;
  const status = String(p.Status ?? p.status ?? "").toLowerCase();
  const talk = Number(p.ConversationDuration ?? p.DialCallDuration ?? p.Duration ?? 0) || 0;
  const rec = p.RecordingUrl || null;
  const auto = call.disposition === PENDING;
  await exec(`UPDATE calls SET call_status=?, duration_sec=GREATEST(duration_sec, ?), recording_url=COALESCE(?, recording_url),
      started_at=COALESCE(?, started_at), ended_at=COALESCE(?, NOW()), disposition=IF(disposition=?, ?, disposition) WHERE id=?`,
    [status, talk, rec, p.StartTime || null, p.EndTime || null, PENDING, AUTO_DISPO[status] ?? "Not Answered", call.id]);
  if (auto) {
    // agent has not logged it: count it now so dashboards stay right; logCall later only edits the disposition
    await exec("UPDATE leads SET total_calls=total_calls+1, last_contact_at=NOW(), sla_alerted=1, in_reactivation=0 WHERE id=?", [call.lead_id]);
    await activity(call.lead_id, call.user_id, "call", `Call (auto-logged by telephony): ${AUTO_DISPO[status] ?? status}${talk ? ` (${Math.round(talk / 60)} min)` : ""}`);
  }
  return true;
}
