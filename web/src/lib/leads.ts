import { audit, exec, getSetting, notify, one, q } from "./db";
import { pickAttribution, transitionAllowed } from "./rules";
export { pickAttribution, transitionAllowed };

export const DISPOSITIONS = [
  "Connected", "Not Answered", "Busy", "Switched Off", "Invalid Number", "Call Back Requested",
  "Interested", "Not Interested", "Follow-up Required", "Converted", "Wrong Number",
] as const;
/** Default priorities, highest first. Admins can change the list in Settings (setting "priorities"). */
export const PRIORITIES = ["hot", "high", "medium", "low"];

export async function getPriorities(): Promise<string[]> {
  const list = (await getSetting("priorities", PRIORITIES.join(","))).split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  return list.length ? list : PRIORITIES;
}
/** ORDER BY expression, highest priority first. Values come from settings, so they are restricted to safe characters. */
export const prioritySql = (list: string[], col = "l.priority") =>
  `FIELD(${col},${list.filter((p) => /^[a-z0-9 _-]+$/.test(p)).map((p) => `'${p}'`).join(",") || "''"})`;

/** Automation rule switches (Settings → Automation). Default on. */
export const ruleOn = async (rule: string) => (await getSetting(`rule_${rule}`, "1")) === "1";


export const CHANNELS = [
  "Facebook Ads", "Instagram Ads", "Google Ads", "Influencer Marketing", "WhatsApp",
  "Events & Activations", "Referrals", "Offline Marketing", "Other",
] as const;
export const PAYMENT_STATUSES = ["Pending", "Partially Paid", "Paid", "Refunded", "Cancelled"] as const;

export type LeadInput = {
  name: string; mobile: string; alt_mobile?: string; email?: string; business_name?: string; category?: string; city?: string;
  source?: string; channel?: string; campaign_id?: number | null; campaign_name?: string;
  adset_id?: string; adset_name?: string; ad_id?: string; ad_name?: string; form_name?: string; meta_lead_id?: string;
  owner_id?: number | null; priority?: string; remarks?: string; tags?: string; created_at?: string;
  expected_revenue?: number | null; consent?: boolean; comm_pref?: string;
};

export type Touch = { campaign_id?: number | null; source?: string; channel?: string; adset_name?: string; ad_name?: string; touched_at?: string };

/** Record a marketing touch (lead creation or a re-enquiry) for attribution. */
export async function addTouch(leadId: number, t: Touch) {
  await exec("INSERT INTO lead_touches (lead_id,campaign_id,source,channel,adset_name,ad_name,touched_at) VALUES (?,?,?,?,?,?,COALESCE(?,NOW()))",
    [leadId, t.campaign_id ?? null, t.source || null, t.channel || null, t.adset_name || null, t.ad_name || null, t.touched_at || null]);
}

/** Campaign credited for a sale on this lead, per the attribution_model setting (first_touch | last_touch). */
export async function attributedCampaign(leadId: number) {
  const model = await getSetting("attribution_model", "last_touch");
  const touches = await q<{ campaign_id: number | null }>("SELECT campaign_id FROM lead_touches WHERE lead_id=? ORDER BY touched_at, id", [leadId]);
  const lead = await one<{ campaign_id: number | null }>("SELECT campaign_id FROM leads WHERE id=?", [leadId]);
  return { campaignId: pickAttribution(touches, model)?.campaign_id ?? lead?.campaign_id ?? null, model };
}

/** Indian mobile normalisation: keep digits, drop +91/0 prefix → 10 digits when possible. */
export function normMobile(m: string | undefined | null) {
  let d = String(m ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

export const validMobile = (m: string) => /^\d{10,15}$/.test(m);
export const validEmail = (e: string) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** Duplicate rule is configurable: "mobile" | "mobile_or_email" | "off". */
export async function findDuplicate(mobile: string, email?: string | null) {
  const rule = await getSetting("duplicate_rule", "mobile_or_email");
  if (rule === "off") return undefined;
  const m = normMobile(mobile);
  if (rule === "mobile" || !email?.trim())
    return one<{ id: number; lead_code: string }>("SELECT id,lead_code FROM leads WHERE mobile=? OR alt_mobile=? LIMIT 1", [m, m]);
  return one<{ id: number; lead_code: string }>(
    "SELECT id,lead_code FROM leads WHERE mobile=? OR alt_mobile=? OR email=? LIMIT 1", [m, m, email.trim().toLowerCase()],
  );
}

export async function stageIdByName(name?: string) {
  const s = name ? await one<{ id: number }>("SELECT id FROM stages WHERE name=?", [name]) : undefined;
  return s?.id ?? (await one<{ id: number }>("SELECT id FROM stages ORDER BY position LIMIT 1"))!.id;
}

/**
 * Lead distribution (SRS §10): first matching rule (source/campaign/category → user or team),
 * else round robin over active + available executives, honouring each user's daily cap.
 * Unavailable or capped users are skipped, so leads flow to the next eligible person.
 */
export async function pickAssignee(lead: { source?: string; campaign_id?: number | null; category?: string }): Promise<number | null> {
  if ((await getSetting("assign_mode", "round_robin")) === "manual") return null;
  const rules = await q("SELECT * FROM assignment_rules ORDER BY position, id");
  const rule = rules.find((r) =>
    (r.field === "source" && r.value === lead.source) ||
    (r.field === "campaign" && r.value === String(lead.campaign_id ?? "")) ||
    (r.field === "category" && r.value === lead.category));

  let where = "u.role IN ('calling_executive','sales_executive')";
  const params: number[] = [];
  if (rule?.user_id) { where = "u.id=?"; params.push(rule.user_id); }
  else if (rule?.team_id) { where = "u.team_id=? AND u.role IN ('calling_executive','sales_executive','team_leader')"; params.push(rule.team_id); }

  const u = await one<{ id: number }>(
    `SELECT u.id FROM users u
     WHERE ${where} AND u.active=1 AND u.available=1
       AND (SELECT COUNT(*) FROM leads l WHERE l.owner_id=u.id AND l.assigned_at>=CURDATE()) < u.daily_lead_cap
     ORDER BY u.last_assigned_at IS NOT NULL, u.last_assigned_at, u.id LIMIT 1`, params);
  return u?.id ?? null;
}

export async function activity(leadId: number, userId: number | null, type: string, message: string) {
  await exec("INSERT INTO lead_activities (lead_id,user_id,type,message) VALUES (?,?,?,?)", [leadId, userId, type, message]);
}

export async function createLead(input: LeadInput, actorId: number | null, opts: { autoAssign?: boolean } = {}) {
  const mobile = normMobile(input.mobile);
  let owner = input.owner_id ?? null;
  if (!owner && opts.autoAssign !== false) owner = await pickAssignee(input);
  const stageId = await stageIdByName(owner ? "Assigned" : undefined);
  const priorities = await getPriorities();
  const priority = priorities.includes(String(input.priority ?? "").toLowerCase()) ? String(input.priority).toLowerCase()
    : priorities.includes("medium") ? "medium" : priorities[Math.floor(priorities.length / 2)];

  const res = await exec(
    `INSERT INTO leads (name,mobile,alt_mobile,email,business_name,category,city,source,channel,campaign_id,campaign_name,
      adset_id,adset_name,ad_id,ad_name,form_name,meta_lead_id,owner_id,assigned_at,priority,stage_id,remarks,tags,expected_revenue,consent,
      consent_at,consent_source,comm_pref,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(?,NOW()))`,
    [
      input.name.trim(), mobile, normMobile(input.alt_mobile) || null, input.email?.trim().toLowerCase() || null,
      input.business_name || null, input.category || null, input.city || null, input.source || "Manual", input.channel || null,
      input.campaign_id ?? null, input.campaign_name || null, input.adset_id || null, input.adset_name || null,
      input.ad_id || null, input.ad_name || null, input.form_name || null, input.meta_lead_id || null,
      owner, owner ? new Date() : null, priority,
      stageId, input.remarks || null, input.tags || null, input.expected_revenue ?? null, input.consent === false ? 0 : 1,
      input.consent === false ? null : new Date(), input.consent === false ? null : input.source || "Manual", input.comm_pref || null,
      input.created_at || null,
    ],
  );
  const id = res.insertId;
  await exec("UPDATE leads SET lead_code=? WHERE id=?", [`GOD-${String(id).padStart(6, "0")}`, id]);
  await activity(id, actorId, "create", `Lead created via ${input.source || "Manual"}`);
  await addTouch(id, { ...input, touched_at: input.created_at });
  if (owner) {
    await exec("UPDATE users SET last_assigned_at=NOW(6) WHERE id=?", [owner]);
    await activity(id, actorId, "assign", input.owner_id ? "Assigned on creation" : "Assigned automatically");
    await notify(owner, `New lead assigned: ${input.name}`, `/leads/${id}`);
  }
  await audit(actorId, "create", "lead", id, { source: input.source || "Manual" });
  // Phase 3 WhatsApp automation: welcome template to new leads who consented (no-op unless configured)
  if (input.consent !== false && (await ruleOn("wa_welcome")))
    import("./channels").then((c) => c.whatsappWelcome(id)).catch(() => {});
  return id;
}

/** `quiet` skips the per-lead notification; bulk callers (split & assign) send one summary instead. */
export async function assignLead(leadId: number, userId: number | null, actorId: number | null, opts: { quiet?: boolean } = {}) {
  const lead = await one("SELECT l.owner_id, l.name, s.name stage FROM leads l JOIN stages s ON s.id=l.stage_id WHERE l.id=?", [leadId]);
  if (!lead || lead.owner_id === userId) return;
  await exec("UPDATE leads SET owner_id=?, assigned_at=NOW(), sla_alerted=0 WHERE id=?", [userId, leadId]);
  if (lead.stage === "New Lead" && userId) await changeStage(leadId, await stageIdByName("Assigned"), actorId, undefined, { force: true });
  // pending follow-ups move with the lead; the change stays in the activity log
  await exec("UPDATE followups SET assigned_to=? WHERE lead_id=? AND status='pending'", [userId, leadId]);
  const to = userId ? (await one("SELECT name FROM users WHERE id=?", [userId]))?.name : "Unassigned";
  await activity(leadId, actorId, "assign", `Assigned to ${to}`);
  await audit(actorId, "assign", "lead", leadId, { from: lead.owner_id, to: userId });
  if (userId && !opts.quiet) await notify(userId, `Lead assigned to you: ${lead.name}`, `/leads/${leadId}`);
}

/**
 * Moves a lead to a stage, recording history. Admin transition rules (stages.allowed_next) apply to manual moves;
 * system moves that follow from a fact (a sale was booked, a lead was assigned) pass `force`.
 */
export async function changeStage(leadId: number, stageId: number, actorId: number | null, lostReason?: string, opts: { force?: boolean } = {}) {
  const lead = await one("SELECT l.stage_id, l.name, s.name stage, s.allowed_next FROM leads l JOIN stages s ON s.id=l.stage_id WHERE l.id=?", [leadId]);
  if (!lead || lead.stage_id === stageId) return;
  const to = await one("SELECT * FROM stages WHERE id=?", [stageId]);
  if (!to) throw new Error("Unknown stage");
  if (!opts.force && !transitionAllowed(lead.allowed_next, stageId)) {
    const allowed = await q("SELECT name FROM stages WHERE FIND_IN_SET(id, ?) ORDER BY position", [lead.allowed_next]);
    throw new Error(`Moving from "${lead.stage}" to "${to.name}" is not allowed. Allowed next stages: ${allowed.map((a) => a.name).join(", ")}`);
  }
  if (to.is_lost && !lostReason?.trim()) throw new Error(`A lost reason is required to move a lead to ${to.name}`);

  await exec(
    `INSERT INTO stage_history (lead_id,from_stage_id,to_stage_id,user_id,seconds_in_prev)
     SELECT id, stage_id, ?, ?, TIMESTAMPDIFF(SECOND, stage_changed_at, NOW()) FROM leads WHERE id=?`, [stageId, actorId, leadId]);
  await exec("UPDATE leads SET stage_id=?, stage_changed_at=NOW(), lost_reason=COALESCE(?,lost_reason), in_reactivation=0 WHERE id=?",
    [stageId, to.is_lost ? lostReason : null, leadId]);
  await activity(leadId, actorId, "stage", `Stage → ${to.name}${to.is_lost ? ` (reason: ${lostReason})` : ""}`);
  await audit(actorId, "stage_change", "lead", leadId, { from: lead.stage_id, to: stageId });

  // SRS §15: interested / qualified lead → notify sales managers
  if ((to.name === "Interested" || to.is_qualified) && (await ruleOn("interested"))) {
    const managers = await q<{ id: number }>("SELECT id FROM users WHERE role='sales_manager' AND active=1");
    for (const m of managers) await notify(m.id, `${lead.name} moved to ${to.name}`, `/leads/${leadId}`);
  }
}
