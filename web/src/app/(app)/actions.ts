"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ALL, can, encrypt, endSession, hashPassword, leadScope, requireUser, type Perm, type Role, type User } from "@/lib/auth";
import { audit, exec, getSetting, notify, one, q, setSetting } from "@/lib/db";
import {
  activity, assignLead, attributedCampaign, changeStage, createLead, findDuplicate, normMobile, pickAssignee, stageIdByName, validEmail, validMobile,
} from "@/lib/leads";
import { connectPage, reconcile, refreshForms, retryFailed, syncAdSpend, tokenStatus } from "@/lib/meta";
import { sendEmail, sendWhatsApp, waAllowed } from "@/lib/channels";
import { clickToCall, PENDING, telephonyEnabled } from "@/lib/telephony";
import { anonymizeLead, runRetention } from "@/lib/retention";
import { recomputeScores } from "@/lib/scoring";
import { runBackup } from "@/lib/backup";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const n = (f: FormData, k: string) => (s(f, k) === "" ? null : Number(s(f, k)));
const done = () => revalidatePath("/", "layout");

async function leadFor(u: User, leadId: number) {
  const sc = leadScope(u);
  const l = await one(`SELECT l.* FROM leads l WHERE l.id=? AND ${sc.sql}`, [leadId, ...sc.params]);
  if (!l) throw new Error("Lead not found or not permitted");
  return l;
}

export async function logout() {
  await endSession();
  redirect("/login");
}

// ---------- Leads ----------
export type FormState = { error?: string; dupId?: number; ok?: string } | undefined;

export async function createLeadAction(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser("lead.create");
  const mobile = normMobile(s(f, "mobile"));
  if (!s(f, "name")) return { error: "Name is required" };
  if (!validMobile(mobile)) return { error: "Enter a valid mobile number (10–15 digits)" };
  if (!validEmail(s(f, "email"))) return { error: "Invalid email" };
  if (!s(f, "force")) {
    const dup = await findDuplicate(mobile, s(f, "email"));
    if (dup) return { error: `Duplicate: ${dup.lead_code} already has this mobile/email.`, dupId: dup.id };
  }
  const campaignId = n(f, "campaign_id");
  const camp = campaignId ? await one("SELECT name, channel FROM campaigns WHERE id=?", [campaignId]) : undefined;
  const owner = can(u, "lead.assign") ? n(f, "owner_id") : u.role.endsWith("executive") ? u.id : null;
  const id = await createLead({
    name: s(f, "name"), mobile, alt_mobile: s(f, "alt_mobile"), email: s(f, "email"), business_name: s(f, "business_name"),
    category: s(f, "category"), city: s(f, "city"), source: s(f, "source") || "Manual", channel: camp?.channel ?? s(f, "channel"),
    campaign_id: campaignId, campaign_name: camp?.name, priority: s(f, "priority"), remarks: s(f, "remarks"), tags: s(f, "tags"),
    owner_id: owner, expected_revenue: n(f, "expected_revenue"), consent: f.get("consent") === "on",
    comm_pref: f.getAll("comm_pref").map(String).join(","),
  }, u.id, { autoAssign: !owner });
  done();
  redirect(`/leads/${id}`);
}

const EDITABLE = ["name", "mobile", "alt_mobile", "email", "business_name", "category", "city", "source", "priority", "remarks", "tags",
  "expected_revenue", "consent", "dnd", "comm_pref"] as const;

export async function updateLead(f: FormData) {
  const u = await requireUser("lead.edit");
  const id = Number(s(f, "id"));
  const lead = await leadFor(u, id);
  const changes: string[] = [];
  const vals: Record<string, unknown> = {};
  for (const k of EDITABLE) {
    let v: unknown = k === "consent" || k === "dnd" ? (f.get(k) === "on" ? 1 : 0)
      : k === "comm_pref" ? f.getAll("comm_pref").map(String).join(",") || null : s(f, k) || null;
    if (k === "mobile" || k === "alt_mobile") v = normMobile(v as string) || null;
    if (k === "expected_revenue") v = v == null ? null : Number(v);
    if (String(lead[k] ?? "") !== String(v ?? "")) { vals[k] = v; changes.push(`${k}: "${lead[k] ?? ""}" → "${v ?? ""}"`); }
  }
  if ("mobile" in vals && !validMobile(String(vals.mobile ?? ""))) throw new Error("A valid mobile number is required");
  if (!changes.length) return;
  if ("consent" in vals) Object.assign(vals, { consent_at: vals.consent ? new Date() : null, consent_source: vals.consent ? `Recorded by ${u.name}` : null });
  await exec(`UPDATE leads SET ${Object.keys(vals).map((k) => `${k}=?`).join(",")} WHERE id=?`, [...Object.values(vals) as never[], id]);
  await activity(id, u.id, "edit", "Edited: " + changes.join("; "));
  await audit(u.id, "edit", "lead", id, vals);
  done();
}

export async function addNote(f: FormData) {
  const u = await requireUser();
  const id = Number(s(f, "lead_id"));
  await leadFor(u, id);
  if (s(f, "note")) await activity(id, u.id, "note", s(f, "note"));
  done();
}

export async function assignAction(f: FormData) {
  const u = await requireUser("lead.assign");
  const id = Number(s(f, "lead_id"));
  await leadFor(u, id);
  await assignLead(id, n(f, "owner_id"), u.id);
  done();
}

export async function stageAction(f: FormData) {
  const u = await requireUser("lead.edit");
  const id = Number(s(f, "lead_id"));
  await leadFor(u, id);
  await changeStage(id, Number(s(f, "stage_id")), u.id, s(f, "lost_reason"));
  done();
}

/** Used by the Kanban board drag & drop. */
export async function moveStage(leadId: number, stageId: number, lostReason?: string) {
  const u = await requireUser("lead.edit");
  await leadFor(u, leadId);
  try { await changeStage(leadId, stageId, u.id, lostReason); } catch (e) { return { error: (e as Error).message }; }
  done();
  return {};
}

export async function bulkAction(f: FormData) {
  const u = await requireUser();
  const ids = f.getAll("ids").map(Number).filter(Boolean);
  const op = s(f, "op");
  if (!ids.length) return;
  const need: Record<string, Perm> = { assign: "lead.assign", stage: "lead.edit", priority: "lead.edit", tag: "lead.edit", delete: "lead.delete" };
  if (!need[op] || !can(u, need[op])) throw new Error("Not permitted");
  const sc = leadScope(u);
  const allowed = (await q<{ id: number }>(`SELECT l.id FROM leads l WHERE l.id IN (?) AND ${sc.sql}`, [ids, ...sc.params])).map((r) => r.id);
  for (const id of allowed) {
    if (op === "assign") await assignLead(id, n(f, "owner_id"), u.id);
    if (op === "stage") await changeStage(id, Number(s(f, "stage_id")), u.id, s(f, "lost_reason"));
    if (op === "priority") { await exec("UPDATE leads SET priority=? WHERE id=?", [s(f, "priority"), id]); await activity(id, u.id, "edit", `Priority → ${s(f, "priority")}`); }
    if (op === "tag" && s(f, "tag")) {
      await exec("UPDATE leads SET tags=CONCAT_WS(',', NULLIF(tags,''), ?) WHERE id=? AND NOT FIND_IN_SET(?, COALESCE(tags,''))", [s(f, "tag"), id, s(f, "tag")]);
      await activity(id, u.id, "edit", `Tag added: ${s(f, "tag")}`);
    }
  }
  if (op === "delete" && allowed.length) {
    const snap = await q("SELECT id, lead_code, name, mobile FROM leads WHERE id IN (?)", [allowed]);
    await exec("DELETE FROM leads WHERE id IN (?)", [allowed]);
    await audit(u.id, "bulk_delete", "lead", null, snap);
  } else {
    await audit(u.id, `bulk_${op}`, "lead", null, { ids: allowed, owner: s(f, "owner_id"), stage: s(f, "stage_id"), priority: s(f, "priority"), tag: s(f, "tag") });
  }
  done();
}

export async function deleteLead(f: FormData) {
  const u = await requireUser("lead.delete");
  const id = Number(s(f, "id"));
  const l = await leadFor(u, id);
  await exec("DELETE FROM leads WHERE id=?", [id]);
  await audit(u.id, "delete", "lead", id, { lead_code: l.lead_code, name: l.name, mobile: l.mobile });
  done();
  redirect("/leads");
}

// ---------- Calls & follow-ups ----------
const DISPO_STAGE: Record<string, string> = {
  "Connected": "Connected", "Interested": "Interested", "Converted": "Converted / Won", "Not Interested": "Lost",
  "Wrong Number": "Lost", "Invalid Number": "Lost", "Call Back Requested": "Connected", "Follow-up Required": "Connected",
};

export async function logCall(f: FormData) {
  const u = await requireUser("calls.log");
  const leadId = Number(s(f, "lead_id"));
  const lead = await leadFor(u, leadId);
  const dispo = s(f, "disposition");
  if (!dispo) throw new Error("Select a disposition");
  const dur = Math.max(0, Number(s(f, "duration_sec") || 0) || Number(s(f, "duration_min") || 0) * 60);
  const ended = new Date();
  const started = new Date(ended.getTime() - dur * 1000);
  // a click-to-call row already exists: complete it (telephony's duration/recording win over the browser timer)
  const tel = n(f, "call_id") ? await one("SELECT * FROM calls WHERE id=? AND user_id=? AND lead_id=?", [n(f, "call_id"), u.id, leadId]) : undefined;
  if (tel) {
    await exec("UPDATE calls SET disposition=?, remarks=?, duration_sec=GREATEST(duration_sec, ?), ended_at=COALESCE(ended_at, ?) WHERE id=?",
      [dispo, s(f, "remarks") || null, dur, ended, tel.id]);
  } else {
    await exec("INSERT INTO calls (lead_id,user_id,started_at,ended_at,duration_sec,disposition,remarks) VALUES (?,?,?,?,?,?,?)",
      [leadId, u.id, started, ended, dur, dispo, s(f, "remarks") || null]);
  }
  if (!tel || tel.disposition === PENDING) // already counted if the telephony callback auto-logged it
    await exec("UPDATE leads SET total_calls=total_calls+1, last_contact_at=NOW(), sla_alerted=1, in_reactivation=0 WHERE id=?", [leadId]);
  await activity(leadId, u.id, "call", `Call: ${dispo}${dur ? ` (${Math.round(dur / 60)} min)` : ""}${s(f, "remarks") ? ` — ${s(f, "remarks")}` : ""}`);

  // close follow-ups that were due, with this call as the outcome
  await exec("UPDATE followups SET status='done', outcome=?, completed_at=NOW() WHERE lead_id=? AND status='pending' AND due_at<=NOW() + INTERVAL 1 HOUR",
    [`Call: ${dispo}. ${s(f, "remarks")}`, leadId]);

  // move the pipeline forward automatically (never backwards, except to Lost); an explicit stage wins
  const cur = (await one("SELECT position FROM stages WHERE id=?", [lead.stage_id]))!;
  const auto = DISPO_STAGE[dispo] ?? (cur.position <= 2 ? "First Contact Attempted" : "");
  const target = s(f, "stage_id") ? Number(s(f, "stage_id")) : auto ? await stageIdByName(auto) : null;
  if (target && target !== lead.stage_id) {
    const t = (await one("SELECT position, is_lost FROM stages WHERE id=?", [target]))!;
    if (s(f, "stage_id")) await changeStage(leadId, target, u.id, t.is_lost ? s(f, "lost_reason") || dispo : undefined);
    // automatic moves respect the admin's transition rules: if not allowed, the stage simply stays
    else if (t.is_lost || t.position > cur.position)
      await changeStage(leadId, target, u.id, t.is_lost ? s(f, "lost_reason") || dispo : undefined).catch(() => {});
  }
  if (s(f, "next_followup")) await addFollowup(leadId, lead.owner_id ?? u.id, s(f, "next_followup"), s(f, "remarks"), u.id);
  else await syncNextFollowup(leadId);
  done();
  if (s(f, "next")) redirect(s(f, "next"));
}

async function syncNextFollowup(leadId: number) {
  const r = await one("SELECT MIN(due_at) d FROM followups WHERE lead_id=? AND status='pending'", [leadId]);
  await exec("UPDATE leads SET next_followup_at=? WHERE id=?", [r?.d ?? null, leadId]);
}

async function addFollowup(leadId: number, assignee: number, due: string, note: string, actor: number) {
  const when = due.replace("T", " ");
  await exec("INSERT INTO followups (lead_id,assigned_to,due_at,note,created_by) VALUES (?,?,?,?,?)", [leadId, assignee, when, note || null, actor]);
  await syncNextFollowup(leadId);
  await activity(leadId, actor, "followup", `Follow-up scheduled for ${when}${note ? ` — ${note}` : ""}`);
  if (assignee !== actor) await notify(assignee, `Follow-up scheduled for you`, `/leads/${leadId}`);
}

export async function scheduleFollowup(f: FormData) {
  const u = await requireUser("lead.edit");
  const leadId = Number(s(f, "lead_id"));
  const lead = await leadFor(u, leadId);
  if (!s(f, "due_at")) throw new Error("Pick a date/time");
  const assignee = can(u, "lead.assign") && n(f, "assigned_to") ? n(f, "assigned_to")! : lead.owner_id ?? u.id;
  await addFollowup(leadId, assignee, s(f, "due_at"), s(f, "note"), u.id);
  done();
}

export async function completeFollowup(f: FormData) {
  const u = await requireUser();
  const fu = await one("SELECT * FROM followups WHERE id=?", [Number(s(f, "id"))]);
  if (!fu) throw new Error("Follow-up not found");
  await leadFor(u, fu.lead_id);
  const status = s(f, "status") === "cancelled" ? "cancelled" : "done";
  await exec("UPDATE followups SET status=?, outcome=?, completed_at=NOW() WHERE id=?", [status, s(f, "outcome") || null, fu.id]);
  await activity(fu.lead_id, u.id, "followup", `Follow-up ${status}${s(f, "outcome") ? `: ${s(f, "outcome")}` : ""}`);
  if (status === "done") await exec("UPDATE leads SET last_contact_at=NOW(), in_reactivation=0 WHERE id=?", [fu.lead_id]);
  await syncNextFollowup(fu.lead_id);
  done();
}

export async function reassignFollowup(f: FormData) {
  const u = await requireUser("lead.assign");
  const fu = await one("SELECT f.*, l.name FROM followups f JOIN leads l ON l.id=f.lead_id WHERE f.id=?", [Number(s(f, "id"))]);
  if (!fu) throw new Error("Follow-up not found");
  await leadFor(u, fu.lead_id);
  const to = Number(s(f, "assigned_to"));
  await exec("UPDATE followups SET assigned_to=?, escalated=0, reminded=0 WHERE id=?", [to, fu.id]);
  const name = (await one("SELECT name FROM users WHERE id=?", [to]))?.name;
  await activity(fu.lead_id, u.id, "followup", `Follow-up reassigned to ${name}`);
  await notify(to, `Follow-up reassigned to you: ${fu.name}`, `/leads/${fu.lead_id}`);
  done();
}

// ---------- Sales & payments ----------
async function recomputeSale(saleId: number) {
  const sale = await one("SELECT order_value, status FROM sales WHERE id=?", [saleId]);
  if (!sale || sale.status === "Cancelled" || sale.status === "Refunded") return;
  const paid = Number((await one("SELECT COALESCE(SUM(amount),0) p FROM payments WHERE sale_id=?", [saleId]))!.p);
  const status = paid <= 0 ? "Pending" : paid < sale.order_value ? "Partially Paid" : "Paid";
  await exec("UPDATE sales SET status=? WHERE id=?", [status, saleId]);
}

const today = () => new Date().toISOString().slice(0, 10);

export async function createSale(f: FormData) {
  const u = await requireUser("sales.manage");
  const leadId = Number(s(f, "lead_id"));
  const lead = await leadFor(u, leadId);
  const value = Number(s(f, "order_value"));
  if (!s(f, "product") || !(value > 0)) throw new Error("Product and order value are required");
  const attr = await attributedCampaign(leadId);
  const r = await exec(
    "INSERT INTO sales (lead_id,campaign_id,attribution,user_id,product,sale_date,order_value,gross_profit,invoice_no) VALUES (?,?,?,?,?,?,?,?,?)",
    [leadId, attr.campaignId, attr.model, lead.owner_id ?? u.id, s(f, "product"), s(f, "sale_date") || today(),
      value, Number(s(f, "gross_profit") || 0), s(f, "invoice_no") || null]);
  if (Number(s(f, "amount_received")) > 0)
    await exec("INSERT INTO payments (sale_id,amount,paid_at,mode,reference_id,created_by) VALUES (?,?,?,?,?,?)",
      [r.insertId, Number(s(f, "amount_received")), s(f, "sale_date") || today(), s(f, "mode") || "Cash", s(f, "reference_id") || null, u.id]);
  await recomputeSale(r.insertId);
  await exec("UPDATE leads SET actual_revenue=(SELECT SUM(order_value) FROM sales WHERE lead_id=? AND status NOT IN ('Cancelled','Refunded')) WHERE id=?", [leadId, leadId]);
  const won = (await one("SELECT id FROM stages WHERE is_won=1 ORDER BY position LIMIT 1"))?.id ?? (await stageIdByName("Converted / Won"));
  await changeStage(leadId, won, u.id, undefined, { force: true }); // a booked sale is a fact; transition rules don't block it
  await activity(leadId, u.id, "sale", `Sale booked: ${s(f, "product")} ₹${value}`);
  await audit(u.id, "create", "sale", r.insertId, { leadId, value });
  for (const m of await q<{ id: number }>("SELECT id FROM users WHERE role='sales_manager' AND active=1"))
    await notify(m.id, `Sale booked: ${lead.name} ₹${value}`, `/leads/${leadId}`);
  done();
}

export async function addPayment(f: FormData) {
  const u = await requireUser("sales.manage");
  const sale = await one("SELECT * FROM sales WHERE id=?", [Number(s(f, "sale_id"))]);
  if (!sale) throw new Error("Sale not found");
  await leadFor(u, sale.lead_id);
  const amt = Number(s(f, "amount"));
  if (!amt) throw new Error("Amount required");
  await exec("INSERT INTO payments (sale_id,amount,paid_at,mode,reference_id,created_by) VALUES (?,?,?,?,?,?)",
    [sale.id, amt, s(f, "paid_at") || today(), s(f, "mode") || "Cash", s(f, "reference_id") || null, u.id]);
  await recomputeSale(sale.id);
  await activity(sale.lead_id, u.id, "payment", `Payment ${amt < 0 ? "refunded" : "received"}: ₹${Math.abs(amt)} via ${s(f, "mode") || "Cash"}`);
  await audit(u.id, "payment", "sale", sale.id, { amt });
  const owner = (await one("SELECT owner_id FROM leads WHERE id=?", [sale.lead_id]))?.owner_id;
  if (owner && owner !== u.id) await notify(owner, `Payment received ₹${amt} (${sale.invoice_no ?? "sale #" + sale.id})`, `/leads/${sale.lead_id}`);
  done();
}

export async function setSaleStatus(f: FormData) {
  const u = await requireUser("sales.manage");
  const id = Number(s(f, "sale_id"));
  const sale = await one("SELECT lead_id FROM sales WHERE id=?", [id]);
  if (!sale) throw new Error("Sale not found");
  await leadFor(u, sale.lead_id);
  const st = s(f, "status");
  await exec("UPDATE sales SET status=? WHERE id=?", [st, id]);
  if (st !== "Cancelled" && st !== "Refunded") await recomputeSale(id);
  await activity(sale.lead_id, u.id, "sale", `Sale #${id} status → ${st}`);
  await audit(u.id, "status", "sale", id, { status: st });
  done();
}

// ---------- Campaigns ----------
export async function saveCampaign(f: FormData) {
  const u = await requireUser("campaign.manage");
  const vals = [s(f, "name"), s(f, "type") || null, s(f, "channel") || "Other", s(f, "category") || null, s(f, "start_date") || null,
    s(f, "end_date") || null, Number(s(f, "budget") || 0), s(f, "target_audience") || null, s(f, "objective") || null, n(f, "owner_id"), s(f, "status") || "active"];
  if (!vals[0]) throw new Error("Campaign name required");
  const id = n(f, "id");
  if (id) await exec(`UPDATE campaigns SET name=?,type=?,channel=?,category=?,start_date=?,end_date=?,budget=?,target_audience=?,objective=?,owner_id=?,status=? WHERE id=?`, [...vals as never[], id]);
  else await exec(`INSERT INTO campaigns (name,type,channel,category,start_date,end_date,budget,target_audience,objective,owner_id,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, vals as never[]);
  await audit(u.id, id ? "edit" : "create", "campaign", id, { name: vals[0] });
  done();
}

export async function addSpend(f: FormData) {
  const u = await requireUser("campaign.manage");
  const amt = Number(s(f, "amount"));
  if (!s(f, "spend_date") || !s(f, "amount") || Number.isNaN(amt)) throw new Error("Date and amount are required");
  await exec("INSERT INTO spend_entries (campaign_id,spend_date,amount,source,note,created_by) VALUES (?,?,?,'manual',?,?)",
    [Number(s(f, "campaign_id")), s(f, "spend_date"), amt, s(f, "note") || null, u.id]);
  await audit(u.id, "spend", "campaign", s(f, "campaign_id"), { amt, date: s(f, "spend_date") });
  done();
}

export async function deleteSpend(f: FormData) {
  const u = await requireUser("campaign.manage");
  const row = await one("SELECT * FROM spend_entries WHERE id=?", [Number(s(f, "id"))]);
  await exec("DELETE FROM spend_entries WHERE id=?", [Number(s(f, "id"))]);
  await audit(u.id, "delete", "spend", s(f, "id"), row);
  done();
}

// ---------- Users & teams ----------
export async function saveUser(f: FormData) {
  const u = await requireUser("users.manage");
  const id = n(f, "id");
  const role = s(f, "role");
  if (role === "super_admin" && u.role !== "super_admin") throw new Error("Only a super admin can grant super admin");
  const fields = {
    name: s(f, "name"), email: s(f, "email").toLowerCase(), role, team_id: n(f, "team_id"), manager_id: n(f, "manager_id"),
    daily_lead_cap: Number(s(f, "daily_lead_cap") || 50), target_calls: Number(s(f, "target_calls") || 0),
    target_followups: Number(s(f, "target_followups") || 0), target_conversions: Number(s(f, "target_conversions") || 0),
    active: f.get("active") === "on" ? 1 : 0, available: f.get("available") === "on" ? 1 : 0,
    phone: normMobile(s(f, "phone")) || null, vertical: s(f, "vertical") || null,
    notify_channels: f.getAll("notify_channels").map(String).join(","),
  };
  if (!fields.name || !fields.email || !validEmail(fields.email)) throw new Error("Name and a valid email are required");
  if (id) {
    const target = await one("SELECT role FROM users WHERE id=?", [id]);
    if (target?.role === "super_admin" && u.role !== "super_admin") throw new Error("Only a super admin can edit a super admin");
    await exec(`UPDATE users SET ${Object.keys(fields).map((k) => `${k}=?`).join(",")} WHERE id=?`, [...Object.values(fields) as never[], id]);
    if (s(f, "password")) {
      if (s(f, "password").length < 8) throw new Error("Password must be at least 8 characters");
      await exec("UPDATE users SET password_hash=? WHERE id=?", [hashPassword(s(f, "password")), id]);
    }
  } else {
    if (s(f, "password").length < 8) throw new Error("Password must be at least 8 characters");
    await exec(`INSERT INTO users (${Object.keys(fields).join(",")},password_hash) VALUES (${Object.keys(fields).map(() => "?").join(",")},?)`,
      [...Object.values(fields) as never[], hashPassword(s(f, "password"))]);
  }
  await audit(u.id, id ? "edit" : "create", "user", id, { ...fields });
  done();
}

export async function saveTeam(f: FormData) {
  const u = await requireUser("users.manage");
  const id = n(f, "id");
  if (!s(f, "name")) throw new Error("Team name required");
  if (id) await exec("UPDATE teams SET name=?, department=?, leader_id=? WHERE id=?", [s(f, "name"), s(f, "department") || null, n(f, "leader_id"), id]);
  else await exec("INSERT INTO teams (name, department, leader_id) VALUES (?,?,?)", [s(f, "name"), s(f, "department") || null, n(f, "leader_id")]);
  await audit(u.id, id ? "edit" : "create", "team", id, { name: s(f, "name") });
  done();
}

export async function changePassword(f: FormData) {
  const u = await requireUser();
  if (s(f, "password").length < 8) throw new Error("Password must be at least 8 characters");
  await exec("UPDATE users SET password_hash=? WHERE id=?", [hashPassword(s(f, "password")), u.id]);
  await audit(u.id, "password", "user", u.id);
  done();
}

// ---------- Settings ----------
const GENERAL = ["sla_minutes", "escalate_after_minutes", "inactivity_days", "work_start", "work_end", "duplicate_rule", "assign_mode",
  "attribution_model", "app_url", "backup_time", "backup_keep_days", "retention_notifications_days", "retention_logs_days", "retention_lost_months"];
const FLAGS = ["mask_exports", "reassign_unavailable", "backup_enabled",
  "rule_sla", "rule_reminders", "rule_escalation", "rule_interested", "rule_reactivation", "rule_wa_welcome"];

/** Saves whichever general fields/flags the submitted form contains (each Settings tab posts its own subset). */
export async function saveSettings(f: FormData) {
  const u = await requireUser("settings.manage");
  const changed: Record<string, string> = {};
  for (const k of GENERAL) if (f.has(k)) { await setSetting(k, s(f, k)); changed[k] = s(f, k); }
  if (f.has("priorities")) {
    const list = [...new Set(s(f, "priorities").toLowerCase().split(",").map((p) => p.trim()).filter((p) => /^[a-z0-9 _-]+$/.test(p)))];
    if (list.length < 2) throw new Error("Enter at least two priorities, highest first, e.g. hot,high,medium,low");
    await setSetting("priorities", list.join(","));
    changed.priorities = list.join(",");
  }
  if (f.has("_flags")) for (const k of String(f.get("_flags")).split(",").filter((k) => FLAGS.includes(k))) {
    await setSetting(k, f.get(k) === "on" ? "1" : "0");
    changed[k] = f.get(k) === "on" ? "1" : "0";
  }
  await audit(u.id, "edit", "settings", null, changed);
  done();
}

/** Role-permission matrix override (SRS §4 "configurable access permissions"). Super Admin is fixed to everything. */
export async function savePermissions(f: FormData) {
  const u = await requireUser("settings.manage");
  if (s(f, "reset")) { await setSetting("role_permissions", "{}"); await audit(u.id, "reset", "permissions", null); done(); return; }
  const roles: Role[] = ["admin", "sales_manager", "team_leader", "calling_executive", "sales_executive", "marketing_manager", "viewer"];
  const matrix = Object.fromEntries(roles.map((r) => [r, ALL.filter((p) => f.get(`${r}:${p}`) === "on")]));
  await setSetting("role_permissions", JSON.stringify(matrix));
  await audit(u.id, "edit", "permissions", null, matrix);
  done();
}

/** Email / SMS / WhatsApp credentials. Secrets are only replaced when a new value is typed. */
export async function saveChannels(f: FormData) {
  const u = await requireUser("settings.manage");
  for (const k of ["smtp_host", "smtp_port", "smtp_user", "smtp_from", "sms_webhook_url", "wa_phone_id", "wa_template_lang",
    "wa_notify_template", "wa_welcome_template", "wa_verify_token"]) if (f.has(k)) await setSetting(k, s(f, k));
  for (const k of ["smtp_pass", "wa_token"]) if (s(f, k)) await setSetting(k, encrypt(s(f, k)));
  await audit(u.id, "edit", "settings", "channels");
  done();
}

export async function testChannel(f: FormData) {
  const u = await requireUser("settings.manage");
  const me = (await one("SELECT email, phone FROM users WHERE id=?", [u.id]))!;
  const ch = s(f, "channel");
  let msg: string;
  if (ch === "email") msg = (await sendEmail(me.email, "GetOnDeal CRM test email", "Email notifications are working.")) ? `Test email sent to ${me.email}` : "Email failed — see the message log";
  else {
    if (!me.phone) msg = "Add your phone number on the Team page first";
    else { const r = await sendWhatsApp(me.phone, { template: (await getSetting("wa_notify_template")) || "hello_world", params: (await getSetting("wa_notify_template")) ? ["Test notification"] : [] }, { user_id: u.id }); msg = r.ok ? `WhatsApp test sent to ${me.phone}` : `WhatsApp failed: ${r.error}`; }
  }
  await setSetting("channels_last_test", `${new Date().toLocaleString("en-IN")} — ${msg}`);
  done();
}

export async function saveTelephony(f: FormData) {
  const u = await requireUser("settings.manage");
  for (const k of ["tel_provider", "exotel_sid", "exotel_key", "exotel_subdomain", "exotel_callerid"]) if (f.has(k)) await setSetting(k, s(f, k));
  if (s(f, "exotel_token")) await setSetting("exotel_token", encrypt(s(f, "exotel_token")));
  await audit(u.id, "edit", "settings", "telephony");
  done();
}

export async function saveMeta(f: FormData) {
  const u = await requireUser("settings.manage");
  for (const k of ["meta_verify_token", "meta_ad_account_id", "meta_form_ids", "meta_app_id"]) if (f.has(k)) await setSetting(k, s(f, k));
  if (f.has("_forms")) await setSetting("meta_form_ids", f.getAll("form").map(String).join(","));
  // secrets: only overwritten when a new value is typed; stored AES-256-GCM encrypted, never shown again
  if (s(f, "meta_access_token")) await setSetting("meta_access_token", encrypt(s(f, "meta_access_token")));
  if (s(f, "meta_app_secret")) await setSetting("meta_app_secret", encrypt(s(f, "meta_app_secret")));
  await audit(u.id, "edit", "settings", "meta");
  done();
}

export async function metaOp(f: FormData) {
  const u = await requireUser("settings.manage");
  const op = s(f, "op");
  let msg = "";
  try {
    if (op === "test") msg = (await tokenStatus()).message;
    if (op === "retry") msg = `Retried ${await retryFailed()} failed lead(s)`;
    if (op === "reconcile") msg = `Reconciled: ${await reconcile(Number(s(f, "hours") || 48))} missed lead(s) imported`;
    if (op === "spend") msg = `Synced ${await syncAdSpend(Number(s(f, "days") || 7))} spend row(s)`;
    if (op === "page") msg = `Page connected and subscribed to leadgen; ${await connectPage(s(f, "page_id"))} lead form(s) found`;
    if (op === "forms") msg = `${await refreshForms()} lead form(s) found`;
  } catch (e) { msg = "Error: " + (e as Error).message; }
  await setSetting("meta_last_op", `${new Date().toLocaleString("en-IN")} — ${msg}`);
  await audit(u.id, `meta_${op}`, "settings", "meta", { msg });
  done();
}

export async function regenerateApiKey() {
  const u = await requireUser("settings.manage");
  await setSetting("api_key", randomBytes(24).toString("hex"));
  await audit(u.id, "regenerate", "settings", "api_key");
  done();
}

export async function saveStage(f: FormData) {
  const u = await requireUser("settings.manage");
  const id = n(f, "id");
  const vals = [s(f, "name"), Number(s(f, "position") || 99), s(f, "color") || "#64748b",
    f.get("is_won") === "on" ? 1 : 0, f.get("is_lost") === "on" ? 1 : 0, f.get("is_qualified") === "on" ? 1 : 0];
  if (!vals[0]) throw new Error("Stage name required");
  if (id) await exec("UPDATE stages SET name=?,position=?,color=?,is_won=?,is_lost=?,is_qualified=? WHERE id=?", [...vals as never[], id]);
  else await exec("INSERT INTO stages (name,position,color,is_won,is_lost,is_qualified) VALUES (?,?,?,?,?,?)", vals as never[]);
  await audit(u.id, id ? "edit" : "create", "stage", id, { name: vals[0] });
  done();
}

export async function deleteStage(f: FormData) {
  const u = await requireUser("settings.manage");
  const id = Number(s(f, "id"));
  const used = (await one("SELECT COUNT(*) c FROM leads WHERE stage_id=?", [id]))!.c;
  if (used) throw new Error(`Stage has ${used} lead(s); move them first`);
  await exec("DELETE FROM stages WHERE id=?", [id]);
  await audit(u.id, "delete", "stage", id);
  done();
}

export async function saveRule(f: FormData) {
  const u = await requireUser("settings.manage");
  if (s(f, "delete")) await exec("DELETE FROM assignment_rules WHERE id=?", [Number(s(f, "delete"))]);
  else {
    if (!s(f, "value") || (!n(f, "team_id") && !n(f, "user_id"))) throw new Error("A rule needs a value and a team or user");
    await exec("INSERT INTO assignment_rules (field,value,team_id,user_id,position) VALUES (?,?,?,?,?)",
      [s(f, "field"), s(f, "value"), n(f, "team_id"), n(f, "user_id"), Number(s(f, "position") || 0)]);
  }
  await audit(u.id, "edit", "assignment_rules", null, Object.fromEntries(f));
  done();
}

// ---------- Misc ----------
export async function saveView(f: FormData) {
  const u = await requireUser();
  if (s(f, "delete")) await exec("DELETE FROM saved_views WHERE id=? AND user_id=?", [Number(s(f, "delete")), u.id]);
  else if (s(f, "name")) await exec("INSERT INTO saved_views (user_id,name,query) VALUES (?,?,?)", [u.id, s(f, "name"), s(f, "query")]);
  done();
}

export async function markNotificationsRead() {
  const u = await requireUser();
  await exec("UPDATE notifications SET read_at=NOW() WHERE user_id=? AND read_at IS NULL", [u.id]);
  done();
}

export async function setAvailability(f: FormData) {
  const u = await requireUser();
  await exec("UPDATE users SET available=? WHERE id=?", [s(f, "available") === "1" ? 1 : 0, u.id]);
  await audit(u.id, "availability", "user", u.id, { available: s(f, "available") });
  done();
}

// ---------- Pipeline rules, scoring, data, telephony, messaging ----------
export async function saveStageRules(f: FormData) {
  const u = await requireUser("settings.manage");
  const id = Number(s(f, "id"));
  const allowed = f.getAll("allowed_next").map(Number).filter((x) => x && x !== id);
  await exec("UPDATE stages SET allowed_next=? WHERE id=?", [allowed.length ? allowed.join(",") : null, id]);
  await audit(u.id, "edit", "stage_rules", id, { allowed });
  done();
}

export async function recomputeScoresAction() {
  const u = await requireUser("settings.manage");
  const r = await recomputeScores();
  await setSetting("scoring_last", `${new Date().toLocaleString("en-IN")} — scored ${r.scored} open leads from ${r.closedSample} closed (overall win rate ${r.globalRate}%)`);
  await audit(u.id, "recompute", "scores", null, r);
  done();
}

export async function backupNow() {
  const u = await requireUser("settings.manage");
  let msg: string;
  try { msg = `Backup created: ${await runBackup()}`; } catch (e) { msg = "Backup failed: " + (e as Error).message; }
  await setSetting("backup_last_msg", `${new Date().toLocaleString("en-IN")} — ${msg}`);
  await audit(u.id, "backup", "system", null, { msg });
  done();
}

export async function retentionNow() {
  const u = await requireUser("settings.manage");
  const r = await runRetention();
  await setSetting("retention_last_msg", `${new Date().toLocaleString("en-IN")} — ${JSON.stringify(r)}`);
  await audit(u.id, "retention", "system", null, r);
  done();
}

/** DPDP right to erasure: wipe a lead's personal data but keep the anonymous record for reports. */
export async function anonymizeLeadAction(f: FormData) {
  const u = await requireUser("lead.delete");
  const id = Number(s(f, "id"));
  await leadFor(u, id);
  await anonymizeLead(id, u.id);
  done();
}

/** Team page: move all of a person's open leads (e.g. on leave or exit) to someone else or back into round robin. */
export async function reassignOpenLeads(f: FormData) {
  const u = await requireUser("lead.assign");
  const from = Number(s(f, "from"));
  const to = s(f, "to");
  const sc = leadScope(u);
  const leads = await q(`SELECT l.id, l.source, l.campaign_id, l.category FROM leads l JOIN stages s ON s.id=l.stage_id
    WHERE l.owner_id=? AND s.is_won=0 AND s.is_lost=0 AND ${sc.sql}`, [from, ...sc.params]);
  let moved = 0;
  for (const l of leads) {
    const target = to === "auto" ? await pickAssignee(l) : Number(to);
    if (!target || target === from) continue;
    await assignLead(l.id, target, u.id);
    moved++;
  }
  await audit(u.id, "bulk_reassign", "user", from, { to, moved, of: leads.length });
  done();
}

/** Click-to-call through the cloud telephony provider. Returns the call row id the call panel completes on save. */
export async function clickToCallAction(leadId: number): Promise<{ callId?: number; error?: string }> {
  const u = await requireUser("calls.log");
  await leadFor(u, leadId);
  if (!(await telephonyEnabled())) return { error: "Cloud telephony is not configured" };
  try { return { callId: (await clickToCall(leadId, u)).callId }; } catch (e) { return { error: (e as Error).message }; }
}

export async function sendLeadWhatsApp(f: FormData) {
  const u = await requireUser("lead.edit");
  const id = Number(s(f, "lead_id"));
  const l = await leadFor(u, id);
  if (!waAllowed(l as never)) throw new Error("This lead has not consented to WhatsApp, is on DND, or prefers another channel");
  const r = s(f, "template")
    ? await sendWhatsApp(l.mobile, { template: s(f, "template"), params: s(f, "params") ? s(f, "params").split("|").map((x) => x.trim()) : [] }, { lead_id: id, user_id: u.id })
    : await sendWhatsApp(l.mobile, { text: s(f, "text") }, { lead_id: id, user_id: u.id });
  await activity(id, u.id, "message", r.ok ? `WhatsApp sent: ${s(f, "template") ? `template ${s(f, "template")}` : s(f, "text")}` : `WhatsApp failed: ${r.error}`);
  done();
}

/** Each user picks where their notifications go (in-app always; plus email / WhatsApp / SMS). */
export async function saveMyChannels(f: FormData) {
  const u = await requireUser();
  await exec("UPDATE users SET notify_channels=?, phone=COALESCE(?, phone) WHERE id=?",
    [f.getAll("notify_channels").map(String).join(","), normMobile(s(f, "phone")) || null, u.id]);
  done();
}
