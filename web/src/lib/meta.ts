import { createHmac, timingSafeEqual } from "node:crypto";
import { decrypt, encrypt } from "./auth";
import { exec, getSetting, one, q, setSetting } from "./db";
import { activity, addTouch, createLead, findDuplicate, normMobile } from "./leads";

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}`;
const MAX_ATTEMPTS = 5;

/** "page" token reads leads; "ads" token (user/system-user with ads_read) reads spend. Falls back to the page token. */
async function token(kind: "page" | "ads" = "page") {
  const t = decrypt(await getSetting(kind === "ads" ? "meta_user_token" : "meta_access_token")) || decrypt(await getSetting("meta_access_token"));
  if (!t) throw new Error("Meta access token not configured (Settings → Integrations → Meta)");
  return t;
}

async function graph(path: string, params: Record<string, string> = {}, kind: "page" | "ads" = "page", tok?: string) {
  const u = new URL(GRAPH + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const t = tok ?? (await token(kind));
  if (t) u.searchParams.set("access_token", t); // "" = unauthenticated call (OAuth code exchange)
  const res = await fetch(u, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(body.error?.message ?? `Graph API ${res.status}`);
  return body;
}

export async function verifySignature(raw: string, header: string | null) {
  const secret = decrypt(await getSetting("meta_app_secret"));
  if (!secret) return false; // refuse unsigned payloads until the app secret is configured
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from("sha256=" + createHmac("sha256", secret).update(raw).digest("hex"));
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Token health: identity, granted permissions and expiry (debug_token needs the app ID + secret). */
export async function tokenStatus() {
  try {
    const me = await graph("/me", { fields: "id,name" });
    let extra = "";
    const appId = await getSetting("meta_app_id"), secret = decrypt(await getSetting("meta_app_secret"));
    if (appId && secret) {
      for (const [label, key] of [["page token", "meta_access_token"], ["ads token", "meta_user_token"]]) {
        const t = decrypt(await getSetting(key));
        if (!t) continue;
        const d = (await graph("/debug_token", { input_token: t }, "page", `${appId}|${secret}`)).data ?? {};
        const exp = d.expires_at ? new Date(d.expires_at * 1000).toLocaleDateString("en-IN") : "never";
        extra += ` · ${label}: ${d.is_valid ? "valid" : "INVALID"}, expires ${exp}, scopes ${(d.scopes ?? []).join(", ") || "—"}`;
      }
    }
    return { ok: true, message: `Connected as ${me.name} (${me.id})${extra}` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// ---------- "Connect with Facebook" (OAuth) ----------
export const META_SCOPES = "leads_retrieval,pages_manage_metadata,pages_show_list,pages_read_engagement,ads_read,business_management";

export async function oauthUrl(redirectUri: string, state: string) {
  const appId = await getSetting("meta_app_id");
  if (!appId) throw new Error("Enter the Meta App ID first");
  const u = new URL(`https://www.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}/dialog/oauth`);
  u.search = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, state, scope: META_SCOPES, response_type: "code" }).toString();
  return u.toString();
}

/** Code → long-lived user token (≈60 days; used for ad spend) + the list of Pages it manages. */
export async function exchangeCode(code: string, redirectUri: string) {
  const appId = await getSetting("meta_app_id"), secret = decrypt(await getSetting("meta_app_secret"));
  if (!appId || !secret) throw new Error("Meta App ID and App Secret are required");
  const short = await graph("/oauth/access_token", { client_id: appId, client_secret: secret, redirect_uri: redirectUri, code }, "page", "");
  const long = await graph("/oauth/access_token",
    { grant_type: "fb_exchange_token", client_id: appId, client_secret: secret, fb_exchange_token: short.access_token }, "page", "");
  await setSetting("meta_user_token", encrypt(long.access_token));
  const pages = await graph("/me/accounts", { fields: "id,name,access_token", limit: "100" }, "page", long.access_token);
  await setSetting("meta_pages", encrypt(JSON.stringify(pages.data ?? [])));
  return (pages.data ?? []).length;
}

export async function connectablePages(): Promise<{ id: string; name: string }[]> {
  try { return (JSON.parse(decrypt(await getSetting("meta_pages")) || "[]") as { id: string; name: string }[]).map(({ id, name }) => ({ id, name })); }
  catch { return []; }
}

/** Store the Page token (non-expiring when derived from a long-lived user token), subscribe the Page to leadgen, list its forms. */
export async function connectPage(pageId: string) {
  const page = (JSON.parse(decrypt(await getSetting("meta_pages")) || "[]") as { id: string; name: string; access_token: string }[]).find((p) => p.id === pageId);
  if (!page) throw new Error("Page not found — connect with Facebook again");
  const u = new URL(`${GRAPH}/${page.id}/subscribed_apps`);
  u.search = new URLSearchParams({ subscribed_fields: "leadgen", access_token: page.access_token }).toString();
  const r = await (await fetch(u, { method: "POST" })).json();
  if (r.error) throw new Error(r.error.message);
  await setSetting("meta_access_token", encrypt(page.access_token));
  await setSetting("meta_page_id", page.id);
  await setSetting("meta_page_name", page.name);
  return refreshForms();
}

export async function refreshForms() {
  const pageId = await getSetting("meta_page_id");
  if (!pageId) throw new Error("No Page connected");
  const forms = await graph(`/${pageId}/leadgen_forms`, { fields: "id,name,status", limit: "200" });
  await setSetting("meta_forms", JSON.stringify((forms.data ?? []).map((f: { id: string; name: string; status: string }) => ({ id: f.id, name: f.name, status: f.status }))));
  return (forms.data ?? []).length;
}

const field = (data: { name: string; values: string[] }[], ...names: string[]) =>
  data.find((f) => names.includes(f.name.toLowerCase()))?.values?.[0] ?? "";

/** Fetch one leadgen from Graph and store it. Every outcome is written to meta_sync_logs (no silent loss). */
export async function processLeadgen(leadgenId: string, payload?: unknown) {
  const existingLog = await one("SELECT id FROM meta_sync_logs WHERE leadgen_id=? ORDER BY id DESC LIMIT 1", [leadgenId]);
  const already = await one<{ id: number }>("SELECT id FROM leads WHERE meta_lead_id=?", [leadgenId]);
  if (already) {
    await log(existingLog?.id, leadgenId, "duplicate", payload, null, already.id);
    return already.id;
  }
  try {
    const g = await graph(`/${leadgenId}`, {
      fields: "created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform",
    });
    const selected = (await getSetting("meta_form_ids")).split(",").map((x) => x.trim()).filter(Boolean);
    if (selected.length && g.form_id && !selected.includes(String(g.form_id))) {
      await log(existingLog?.id, leadgenId, "ignored", g, `Form ${g.form_id} is not selected in Settings`, null);
      return null;
    }
    const fd = g.field_data ?? [];
    let formName = g.form_id ?? "";
    try { formName = (await graph(`/${g.form_id}`, { fields: "name" })).name ?? formName; } catch { /* keep form id */ }

    const channel = g.platform === "ig" ? "Instagram Ads" : "Facebook Ads";
    let campaignId: number | null = null;
    if (g.campaign_id) {
      await exec(
        `INSERT INTO campaigns (name, channel, meta_campaign_id, status) VALUES (?,?,?,'active')
         ON DUPLICATE KEY UPDATE name=VALUES(name)`, [g.campaign_name ?? g.campaign_id, channel, g.campaign_id]);
      campaignId = (await one<{ id: number }>("SELECT id FROM campaigns WHERE meta_campaign_id=?", [g.campaign_id]))!.id;
    }

    const mobile = normMobile(field(fd, "phone_number", "phone", "mobile"));
    const email = field(fd, "email");
    const dup = mobile ? await findDuplicate(mobile, email) : undefined;
    if (dup) {
      await activity(dup.id, null, "system", `Re-enquiry from Meta form "${formName}" (campaign ${g.campaign_name ?? "-"})`);
      await addTouch(dup.id, { campaign_id: campaignId, source: "Meta Lead Ads", channel, adset_name: g.adset_name, ad_name: g.ad_name });
      await log(existingLog?.id, leadgenId, "duplicate", g, null, dup.id);
      return dup.id;
    }

    const id = await createLead({
      name: field(fd, "full_name", "name") || [field(fd, "first_name"), field(fd, "last_name")].join(" ").trim() || "Meta Lead",
      mobile: mobile || "0000000000", email, city: field(fd, "city"), business_name: field(fd, "company_name", "business_name"),
      category: field(fd, "category"), source: "Meta Lead Ads", channel,
      campaign_id: campaignId, campaign_name: g.campaign_name, adset_id: g.adset_id, adset_name: g.adset_name,
      ad_id: g.ad_id, ad_name: g.ad_name, form_name: formName, meta_lead_id: leadgenId,
      created_at: g.created_time ? new Date(g.created_time).toISOString().slice(0, 19).replace("T", " ") : undefined,
    }, null);
    await log(existingLog?.id, leadgenId, "success", g, null, id);
    return id;
  } catch (e) {
    await log(existingLog?.id, leadgenId, "failed", payload, (e as Error).message, null);
    return null;
  }
}

async function log(id: number | undefined, leadgenId: string, status: string, payload: unknown, error: string | null, leadId: number | null) {
  const p = payload == null ? null : JSON.stringify(payload).slice(0, 60000);
  if (id) await exec("UPDATE meta_sync_logs SET status=?, payload=COALESCE(?,payload), error=?, lead_id=?, attempts=attempts+1 WHERE id=?",
    [status, p, error, leadId, id]);
  else await exec("INSERT INTO meta_sync_logs (leadgen_id,status,payload,error,lead_id) VALUES (?,?,?,?,?)", [leadgenId, status, p, error, leadId]);
}

/** Retry failed syncs (automation loop + "Retry" button). Gives up after MAX_ATTEMPTS; still visible in logs. */
export async function retryFailed() {
  const rows = await q<{ leadgen_id: string }>("SELECT leadgen_id FROM meta_sync_logs WHERE status='failed' AND attempts<? LIMIT 50", [MAX_ATTEMPTS]);
  for (const r of rows) await processLeadgen(r.leadgen_id);
  return rows.length;
}

/** Reconcile missed leads by pulling each configured form's recent leads from the API. */
export async function reconcile(sinceHours = 48) {
  const forms = (await getSetting("meta_form_ids")).split(",").map((s) => s.trim()).filter(Boolean);
  const since = String(Math.floor(Date.now() / 1000) - sinceHours * 3600);
  let found = 0;
  for (const f of forms) {
    let page = await graph(`/${f}/leads`, {
      fields: "id", limit: "100",
      filtering: JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: since }]),
    });
    for (;;) {
      for (const l of page.data ?? []) {
        if (!(await one("SELECT id FROM leads WHERE meta_lead_id=?", [l.id]))) { await processLeadgen(l.id); found++; }
      }
      if (!page.paging?.next) break;
      page = await (await fetch(page.paging.next)).json();
    }
  }
  return found;
}

/**
 * Pull daily spend per ad (so campaign, ad set and ad ROI all work) into spend_entries (source='meta').
 * Meta rows in the window are replaced, so re-syncing never double-counts; manual entries are untouched.
 */
export async function syncAdSpend(days = 7) {
  const account = await getSetting("meta_ad_account_id");
  if (!account) throw new Error("Ad account ID not configured");
  const until = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  let res = await graph(`/act_${account.replace(/^act_/, "")}/insights`, {
    level: "ad", fields: "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend", time_increment: "1",
    time_range: JSON.stringify({ since, until }), limit: "500",
  }, "ads");
  const rows: Record<string, string>[] = [];
  for (;;) {
    rows.push(...(res.data ?? []));
    if (!res.paging?.next) break;
    res = await (await fetch(res.paging.next)).json();
    if (res.error) throw new Error(res.error.message);
  }
  await exec("DELETE FROM spend_entries WHERE source='meta' AND spend_date BETWEEN ? AND ?", [since, until]);
  for (const r of rows) {
    await exec(`INSERT INTO campaigns (name, channel, meta_campaign_id) VALUES (?, 'Facebook Ads', ?) ON DUPLICATE KEY UPDATE name=VALUES(name)`,
      [r.campaign_name, r.campaign_id]);
    const c = (await one<{ id: number }>("SELECT id FROM campaigns WHERE meta_campaign_id=?", [r.campaign_id]))!;
    await exec(`INSERT INTO spend_entries (campaign_id, spend_date, amount, source, note, adset_id, adset_name, ad_id, ad_name)
      VALUES (?,?,?,'meta','Meta Marketing API',?,?,?,?)`, [c.id, r.date_start, Number(r.spend), r.adset_id, r.adset_name, r.ad_id, r.ad_name]);
  }
  await setSetting("meta_last_spend_sync", new Date().toISOString());
  return rows.length;
}
