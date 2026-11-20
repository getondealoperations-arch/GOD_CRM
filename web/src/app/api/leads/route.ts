import { timingSafeEqual } from "node:crypto";
import { ALL, can, currentUser, type User } from "@/lib/auth";
import { getSetting, one, q } from "@/lib/db";
import { leadWhere, str, type SP } from "@/lib/filters";
import { activity, addTouch, createLead, findDuplicate, normMobile, validEmail, validMobile } from "@/lib/leads";

/** REST API for third-party integrations (SRS §4.4, §18). Auth: `x-api-key` header, or a logged-in session. */
async function auth(req: Request): Promise<User | "api" | null> {
  const key = req.headers.get("x-api-key");
  if (key) {
    const real = await getSetting("api_key");
    return real && key.length === real.length && timingSafeEqual(Buffer.from(key), Buffer.from(real)) ? "api" : null;
  }
  return currentUser();
}
const API_USER: User = { id: 0, name: "API", email: "", role: "admin", team_id: null, vertical: null, perms: ALL };

export async function GET(req: Request) {
  const a = await auth(req);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams) as SP;
  const page = Math.max(1, Number(str(sp.page)) || 1);
  const limit = Math.min(500, Number(str(sp.limit)) || 100);
  const w = leadWhere(a === "api" ? API_USER : a, sp);
  const rows = await q(`SELECT l.*, s.name stage FROM leads l JOIN stages s ON s.id=l.stage_id WHERE ${w.where} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
    [...w.params, limit, (page - 1) * limit]);
  return Response.json({ page, limit, data: rows });
}

export async function POST(req: Request) {
  const a = await auth(req);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (a !== "api" && !can(a, "lead.create")) return Response.json({ error: "Forbidden" }, { status: 403 });
  let b: Record<string, string>;
  try { b = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const mobile = normMobile(b.mobile);
  if (!b.name || !validMobile(mobile)) return Response.json({ error: "name and a valid mobile are required" }, { status: 422 });
  if (!validEmail(b.email ?? "")) return Response.json({ error: "invalid email" }, { status: 422 });
  const camp = b.campaign_name ? await one("SELECT id, channel FROM campaigns WHERE name=? LIMIT 1", [b.campaign_name]) : undefined;
  const dup = await findDuplicate(mobile, b.email);
  if (dup) {
    // re-enquiry: keep one lead, but record the touch so attribution sees it
    await addTouch(dup.id, { campaign_id: camp?.id ?? null, source: b.source || "API", channel: camp?.channel ?? b.channel, adset_name: b.adset_name, ad_name: b.ad_name });
    await activity(dup.id, null, "system", `Re-enquiry via API (${b.source || "API"}${b.campaign_name ? ` / ${b.campaign_name}` : ""})`);
    return Response.json({ duplicate: true, id: dup.id, lead_code: dup.lead_code }, { status: 409 });
  }
  const id = await createLead({
    name: b.name, mobile, email: b.email, alt_mobile: b.alt_mobile, business_name: b.business_name, category: b.category, city: b.city,
    source: b.source || "API", channel: camp?.channel ?? b.channel, campaign_id: camp?.id ?? null, campaign_name: b.campaign_name, adset_name: b.adset_name, ad_name: b.ad_name,
    form_name: b.form_name, remarks: b.remarks, tags: b.tags, priority: b.priority,
  }, a === "api" ? null : a.id);
  return Response.json({ id, lead_code: `GOD-${String(id).padStart(6, "0")}` }, { status: 201 });
}
