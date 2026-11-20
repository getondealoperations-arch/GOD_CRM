import Link from "next/link";
import { headers } from "next/headers";
import { ALL, PERM_LABEL, PERMISSIONS, requireUser, rolePerms, ROLE_LABEL, type Role } from "@/lib/auth";
import { getSetting, q, type Row } from "@/lib/db";
import { str, type SP } from "@/lib/filters";
import { connectablePages } from "@/lib/meta";
import { listBackups } from "@/lib/backup";
import { fmtDate, secondsSince } from "@/components/ui";
import {
  backupNow, deleteStage, metaOp, recomputeScoresAction, regenerateApiKey, retentionNow, saveChannels, saveMeta, savePermissions, saveRule,
  saveSettings, saveStage, saveStageRules, saveTelephony, testChannel,
} from "../actions";

const TABS = [
  ["general", "General & automation"], ["pipeline", "Pipeline & transitions"], ["assignment", "Lead distribution"], ["permissions", "Roles & permissions"],
  ["integrations", "Meta, telephony & API"], ["notifications", "Notifications & WhatsApp"], ["data", "Backups, retention & scoring"], ["system", "System health"],
] as const;

const KEYS = ["sla_minutes", "escalate_after_minutes", "inactivity_days", "work_start", "work_end", "duplicate_rule", "assign_mode", "mask_exports",
  "priorities", "attribution_model", "reassign_unavailable", "app_url", "rule_sla", "rule_reminders", "rule_escalation", "rule_interested",
  "rule_reactivation", "rule_wa_welcome", "meta_verify_token", "meta_ad_account_id", "meta_form_ids", "meta_access_token", "meta_app_secret",
  "meta_app_id", "meta_user_token", "meta_page_id", "meta_page_name", "meta_forms", "meta_last_op", "meta_last_spend_sync", "api_key",
  "smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from", "sms_webhook_url", "wa_token", "wa_phone_id", "wa_template_lang",
  "wa_notify_template", "wa_welcome_template", "wa_verify_token", "channels_last_test", "tel_provider", "exotel_sid", "exotel_key",
  "exotel_token", "exotel_subdomain", "exotel_callerid", "backup_enabled", "backup_time", "backup_keep_days",
  "backup_last_msg", "retention_notifications_days", "retention_logs_days", "retention_lost_months", "retention_last_msg", "scoring_last",
  "automation_last_run"];

const Check = ({ name, label, on }: { name: string; label: string; on: boolean }) => (
  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={on} /> {label}</label>
);
const stored = (v: string) => (v ? "✅ stored (encrypted)" : "— not set");

export default async function Settings({ searchParams }: PageProps<"/settings">) {
  const me = await requireUser("settings.manage");
  const tab = str(((await searchParams) as SP).tab) || "general";
  const s = Object.fromEntries(await Promise.all(KEYS.map(async (k) => [k, await getSetting(k)])));
  const h = await headers();
  const origin = s.app_url || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  return (
    <>
      <h1 className="h1">Settings</h1>
      <nav className="flex flex-wrap gap-1" aria-label="Settings sections">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/settings?tab=${k}`} className={`rounded-lg px-3 py-1.5 text-sm ${tab === k ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}>{label}</Link>
        ))}
      </nav>
      {tab === "general" && <General s={s} />}
      {tab === "pipeline" && <Pipeline />}
      {tab === "assignment" && <Assignment s={s} />}
      {tab === "permissions" && <Permissions />}
      {tab === "integrations" && <Integrations s={s} origin={origin} />}
      {tab === "notifications" && <Notifications s={s} origin={origin} />}
      {tab === "data" && <Data s={s} superAdmin={me.role === "super_admin"} />}
      {tab === "system" && <System s={s} />}
    </>
  );
}

function General({ s }: { s: Record<string, string> }) {
  const flags = ["mask_exports", "rule_sla", "rule_reminders", "rule_escalation", "rule_interested", "rule_reactivation", "rule_wa_welcome"];
  const on = (k: string, dflt = "1") => (s[k] || dflt) === "1";
  return (
    <form action={saveSettings} className="card grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <input type="hidden" name="_flags" value={flags.join(",")} />
      <h2 className="h2 sm:col-span-3 lg:col-span-4">Automation rules (SRS §15)</h2>
      <div className="space-y-1 sm:col-span-3 lg:col-span-4">
        <Check name="rule_sla" label="Alert the team leader when a new lead is not contacted within the SLA" on={on("rule_sla")} />
        <Check name="rule_reminders" label="Remind the owner 15 minutes before a follow-up is due" on={on("rule_reminders")} />
        <Check name="rule_escalation" label="Escalate overdue follow-ups to the team leader / manager" on={on("rule_escalation")} />
        <Check name="rule_interested" label="Notify sales managers when a lead becomes Interested or Qualified" on={on("rule_interested")} />
        <Check name="rule_reactivation" label="Move inactive open leads to the reactivation queue" on={on("rule_reactivation")} />
        <Check name="rule_wa_welcome" label="Send the WhatsApp welcome template to new leads who consented (needs WhatsApp set up)" on={on("rule_wa_welcome", "0")} />
      </div>
      <label className="text-xs">First-contact SLA (minutes)<input name="sla_minutes" type="number" min="1" defaultValue={s.sla_minutes} className="input" /></label>
      <label className="text-xs">Escalate overdue follow-ups after (minutes)<input name="escalate_after_minutes" type="number" min="0" defaultValue={s.escalate_after_minutes} className="input" /></label>
      <label className="text-xs">Inactive → reactivation after (days)<input name="inactivity_days" type="number" min="1" defaultValue={s.inactivity_days} className="input" /></label>
      <div className="flex gap-2">
        <label className="text-xs">Working hours from<input name="work_start" type="time" defaultValue={s.work_start} className="input" /></label>
        <label className="text-xs">to<input name="work_end" type="time" defaultValue={s.work_end} className="input" /></label>
      </div>
      <h2 className="h2 mt-2 sm:col-span-3 lg:col-span-4">Leads, attribution & exports</h2>
      <label className="text-xs">Duplicate detection
        <select name="duplicate_rule" defaultValue={s.duplicate_rule} className="input">
          <option value="mobile_or_email">Mobile or email</option><option value="mobile">Mobile only</option><option value="off">Off</option>
        </select></label>
      <label className="text-xs sm:col-span-2">Priorities (highest first, comma separated)<input name="priorities" defaultValue={s.priorities || "hot,high,medium,low"} className="input" /></label>
      <label className="text-xs">Sale attribution model
        <select name="attribution_model" defaultValue={s.attribution_model || "last_touch"} className="input">
          <option value="last_touch">Last touch (latest campaign before the sale)</option><option value="first_touch">First touch (campaign that created the lead)</option>
        </select></label>
      <label className="text-xs sm:col-span-2">Public app URL (used in links, webhooks and OAuth)<input name="app_url" defaultValue={s.app_url} placeholder="https://crm.getondeal.com" className="input" /></label>
      <div className="flex items-end"><Check name="mask_exports" label="Mask mobile/email in exports (except Super Admin)" on={on("mask_exports", "0")} /></div>
      <div className="flex items-end"><button className="btn">Save</button></div>
      <p className="text-xs text-slate-500 sm:col-span-3 lg:col-span-4">
        Time-based alerts run only inside working hours. Each sale is credited to exactly one campaign using the model above; changing it affects new sales only.
        Notification channels (email, WhatsApp, SMS) are chosen per user — see the Notifications tab.
      </p>
    </form>
  );
}

async function Pipeline() {
  const stages = await q("SELECT s.*, (SELECT COUNT(*) FROM leads l WHERE l.stage_id=s.id) n FROM stages s ORDER BY position");
  return (
    <>
      <section className="card">
        <h2 className="h2">Pipeline stages</h2>
        <div className="space-y-1">
          {[...stages, {} as Row].map((st) => (
            <div key={st.id ?? "new"} className="flex flex-wrap items-center gap-2">
              <form action={saveStage} className="flex flex-wrap items-center gap-2">
                {st.id && <input type="hidden" name="id" value={st.id} />}
                <input name="position" type="number" defaultValue={st.position ?? stages.length + 1} className="input w-16" aria-label="Position" />
                <input name="name" defaultValue={st.name} placeholder="New stage name" required className="input w-56" aria-label="Stage name" />
                <input name="color" type="color" defaultValue={st.color ?? "#64748b"} className="h-8 w-10" aria-label="Colour" />
                <label className="text-xs"><input type="checkbox" name="is_qualified" defaultChecked={!!st.is_qualified} /> qualified</label>
                <label className="text-xs"><input type="checkbox" name="is_won" defaultChecked={!!st.is_won} /> won</label>
                <label className="text-xs"><input type="checkbox" name="is_lost" defaultChecked={!!st.is_lost} /> lost (needs reason)</label>
                <button className="btn-ghost py-1">{st.id ? "Save" : "Add stage"}</button>
              </form>
              {st.id && <span className="text-xs text-slate-400">{st.n} leads</span>}
              {st.id && !st.n && <form action={deleteStage}><input type="hidden" name="id" value={st.id} /><button className="text-xs text-red-600">delete</button></form>}
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h2 className="h2">Transition rules — where can a lead move next?</h2>
        <p className="mb-3 text-xs text-slate-500">Tick the stages a lead may move to from each stage. Nothing ticked = any move allowed. Rules apply to manual moves
          (lead page, Kanban, bulk). Automatic moves from call outcomes follow them silently; a booked sale always marks the lead Won.</p>
        <div className="space-y-3">
          {stages.map((st) => {
            const allowed = String(st.allowed_next ?? "").split(",").map(Number);
            return (
              <form key={st.id} action={saveStageRules} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 pb-2">
                <input type="hidden" name="id" value={st.id} />
                <b className="w-48 text-sm">{st.name} →</b>
                {stages.filter((t) => t.id !== st.id).map((t) => (
                  <label key={t.id} className="text-xs"><input type="checkbox" name="allowed_next" value={t.id} defaultChecked={allowed.includes(t.id)} /> {t.name}</label>
                ))}
                <button className="btn-ghost py-0.5 text-xs">Save</button>
              </form>
            );
          })}
        </div>
      </section>
    </>
  );
}

async function Assignment({ s }: { s: Record<string, string> }) {
  const [rules, teams, users] = await Promise.all([
    q("SELECT r.*, t.name team, us.name user FROM assignment_rules r LEFT JOIN teams t ON t.id=r.team_id LEFT JOIN users us ON us.id=r.user_id ORDER BY r.position, r.id"),
    q("SELECT id, name FROM teams ORDER BY name"),
    q("SELECT id, name FROM users WHERE active=1 ORDER BY name"),
  ]);
  return (
    <>
      <form action={saveSettings} className="card flex flex-wrap items-end gap-3">
        <input type="hidden" name="_flags" value="reassign_unavailable" />
        <label className="text-xs">Lead distribution
          <select name="assign_mode" defaultValue={s.assign_mode} className="input">
            <option value="round_robin">Automatic (rules, then round robin with daily caps)</option><option value="manual">Manual only</option>
          </select></label>
        <Check name="reassign_unavailable" label="Redistribute not-yet-contacted leads of unavailable or deactivated employees" on={(s.reassign_unavailable || "1") === "1"} />
        <button className="btn">Save</button>
        <p className="w-full text-xs text-slate-500">Daily caps and availability are set per person on the Team page. A person over their cap or unavailable is skipped.
          To move everything a person owns (leave, exit), use “Reassign open leads” on the Team page.</p>
      </form>
      <section className="card">
        <h2 className="h2">Assignment rules (first match wins; otherwise round robin)</h2>
        <ul className="mb-3 space-y-1 text-sm">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              #{r.position} If <b>{r.field}</b> = “{r.value}” → {r.user ? `user ${r.user}` : `team ${r.team}`}
              <form action={saveRule}><input type="hidden" name="delete" value={r.id} /><button className="text-xs text-red-600">remove</button></form>
            </li>
          ))}
          {!rules.length && <li className="text-slate-500">No rules — all leads round-robin across available executives.</li>}
        </ul>
        <form action={saveRule} className="flex flex-wrap gap-2">
          <input name="position" type="number" defaultValue={rules.length + 1} className="input w-16" aria-label="Order" />
          <select name="field" className="input w-auto" aria-label="Field"><option value="source">Source</option><option value="campaign">Campaign ID</option><option value="category">Category / vertical</option></select>
          <input name="value" placeholder="Value (e.g. Meta Lead Ads)" required className="input w-56" aria-label="Value" />
          <select name="team_id" className="input w-auto" aria-label="Team"><option value="">→ team…</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select name="user_id" className="input w-auto" aria-label="User"><option value="">or user…</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <button className="btn-ghost">Add rule</button>
        </form>
      </section>
    </>
  );
}

async function Permissions() {
  const roles = (Object.keys(PERMISSIONS) as Role[]).filter((r) => r !== "super_admin");
  const eff = Object.fromEntries(await Promise.all(roles.map(async (r) => [r, await rolePerms(r)])));
  return (
    <form action={savePermissions} className="card overflow-x-auto">
      <h2 className="h2">Role-permission matrix</h2>
      <p className="mb-2 text-xs text-slate-500">Super Admin always has every permission (so nobody can lock the company out). Changes apply on each user&apos;s next page load.
        “View all” beats “View team”; with neither, a user sees only leads they own. A user tied to a vertical (Team page) sees only that category.</p>
      <table className="tbl">
        <thead><tr><th>Permission</th>{roles.map((r) => <th key={r} className="text-center">{ROLE_LABEL[r]}</th>)}</tr></thead>
        <tbody>{ALL.map((p) => (
          <tr key={p}><td>{PERM_LABEL[p]}</td>
            {roles.map((r) => <td key={r} className="text-center"><input type="checkbox" name={`${r}:${p}`} defaultChecked={eff[r].includes(p)} aria-label={`${ROLE_LABEL[r]}: ${PERM_LABEL[p]}`} /></td>)}
          </tr>
        ))}</tbody>
      </table>
      <div className="mt-3 flex gap-2"><button className="btn">Save permissions</button><button name="reset" value="1" className="btn-ghost">Reset to defaults</button></div>
    </form>
  );
}

async function Integrations({ s, origin }: { s: Record<string, string>; origin: string }) {
  const [logs, health, pages] = await Promise.all([
    q("SELECT * FROM meta_sync_logs ORDER BY id DESC LIMIT 50"),
    q(`SELECT SUM(status='success') ok, SUM(status='failed') failed, SUM(status='duplicate') dup, SUM(status='ignored') ignored,
         MAX(CASE WHEN status='success' THEN created_at END) last_ok FROM meta_sync_logs WHERE created_at > NOW() - INTERVAL 7 DAY`),
    connectablePages(),
  ]);
  let forms: { id: string; name: string; status: string }[] = [];
  try { forms = JSON.parse(s.meta_forms || "[]"); } catch { /* none */ }
  const selected = s.meta_form_ids.split(",").map((x) => x.trim());
  return (
    <>
      <section className="card space-y-3">
        <h2 className="h2">Meta Lead Ads & Marketing API</h2>
        <div className="grid gap-2 text-sm sm:grid-cols-5">
          <div>Last 7 days: <b className="text-green-700">{health[0].ok ?? 0}</b> synced</div>
          <div><b className="text-red-600">{health[0].failed ?? 0}</b> failed</div>
          <div><b>{health[0].dup ?? 0}</b> duplicates</div>
          <div><b>{health[0].ignored ?? 0}</b> from unselected forms</div>
          <div>Last success: {fmtDate(health[0].last_ok)}</div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <h3 className="mb-2 text-sm font-semibold">Step 1 — App credentials</h3>
          <form action={saveMeta} className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs">Meta App ID<input name="meta_app_id" defaultValue={s.meta_app_id} className="input" /></label>
            <label className="text-xs">App secret {stored(s.meta_app_secret)}<input name="meta_app_secret" type="password" placeholder="Paste to replace" className="input" autoComplete="off" /></label>
            <label className="text-xs">Webhook verify token<input name="meta_verify_token" defaultValue={s.meta_verify_token} className="input" /></label>
            <label className="text-xs">Ad account ID (spend sync)<input name="meta_ad_account_id" defaultValue={s.meta_ad_account_id} placeholder="act_123…" className="input" /></label>
            <div className="flex items-end"><button className="btn">Save</button></div>
          </form>
          <p className="mt-2 text-xs text-slate-600">In the Meta app: add <b>Facebook Login for Business</b> with redirect URI <code className="rounded bg-slate-100 px-1">{origin}/api/meta/callback</code>,
            and <b>Webhooks → Page → leadgen</b> with callback <code className="rounded bg-slate-100 px-1">{origin}/api/meta/webhook</code> and the verify token above.
            Permissions: leads_retrieval, pages_manage_metadata, pages_show_list, pages_read_engagement, ads_read, business_management (Meta app review required for live use).</p>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <h3 className="mb-2 text-sm font-semibold">Step 2 — Connect the Business account, Page and lead forms</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <a href="/api/meta/connect" className="btn">Connect with Facebook</a>
            <span>Ads token {stored(s.meta_user_token)} · Page: <b>{s.meta_page_name || "none"}</b> {s.meta_page_id && `(${s.meta_page_id})`}</span>
          </div>
          {pages.length > 0 && (
            <form action={metaOp} className="mt-2 flex flex-wrap gap-2">
              <input type="hidden" name="op" value="page" />
              <select name="page_id" defaultValue={s.meta_page_id} className="input w-auto" aria-label="Facebook Page">{pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <button className="btn-ghost">Use this Page (subscribe to leadgen)</button>
            </form>
          )}
          {forms.length > 0 && (
            <form action={saveMeta} className="mt-3 space-y-1">
              <input type="hidden" name="_forms" value="1" />
              <div className="text-xs text-slate-500">Lead forms to capture (none ticked = all forms on the Page):</div>
              {forms.map((f) => <label key={f.id} className="mr-4 inline-flex items-center gap-1 text-sm"><input type="checkbox" name="form" value={f.id} defaultChecked={selected.includes(f.id)} />{f.name} <span className="text-xs text-slate-400">{f.status}</span></label>)}
              <div><button className="btn-ghost">Save form selection</button></div>
            </form>
          )}
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-slate-500">Or paste a token manually (system user)</summary>
            <form action={saveMeta} className="mt-2 grid gap-2 sm:grid-cols-2">
              <label>Page/system-user access token {stored(s.meta_access_token)}<input name="meta_access_token" type="password" placeholder="Paste to replace" className="input" autoComplete="off" /></label>
              <label>Lead form IDs (comma separated)<input name="meta_form_ids" defaultValue={s.meta_form_ids} className="input" /></label>
              <div><button className="btn-ghost">Save</button></div>
            </form>
          </details>
        </div>

        <div className="flex flex-wrap gap-2">
          {[["test", "Check token & permissions"], ["forms", "Refresh form list"], ["retry", "Retry failed"], ["reconcile", "Reconcile last 48h"], ["spend", "Sync ad spend (7d)"]].map(([op, label]) => (
            <form key={op} action={metaOp}><input type="hidden" name="op" value={op} /><button className="btn-ghost">{label}</button></form>
          ))}
        </div>
        {s.meta_last_op && <p className="text-sm">Last action: {s.meta_last_op}</p>}
        <p className="text-xs text-slate-500">Automatic: failed leads retried every minute (5 attempts), missed leads reconciled hourly, ad spend (per ad) synced every 6 hours
          {s.meta_last_spend_sync && ` — last ${new Date(s.meta_last_spend_sync).toLocaleString("en-IN")}`}.</p>
        <div className="max-h-72 overflow-auto">
          <table className="tbl">
            <thead><tr><th>When</th><th>Leadgen ID</th><th>Status</th><th>Attempts</th><th>Lead</th><th>Error</th></tr></thead>
            <tbody>{logs.map((g) => (
              <tr key={g.id}><td className="whitespace-nowrap">{fmtDate(g.updated_at)}</td><td>{g.leadgen_id ?? "—"}</td>
                <td className={g.status === "failed" ? "text-red-600" : g.status === "success" ? "text-green-700" : ""}>{g.status}</td>
                <td>{g.attempts}</td><td>{g.lead_id ? <a className="link" href={`/leads/${g.lead_id}`}>#{g.lead_id}</a> : "—"}</td><td className="text-xs">{g.error}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <form action={saveTelephony} className="card grid gap-2 sm:grid-cols-3">
        <h2 className="h2 sm:col-span-3">Cloud telephony (click-to-call, recordings)</h2>
        <label className="text-xs">Provider
          <select name="tel_provider" defaultValue={s.tel_provider || "none"} className="input"><option value="none">None — use the phone dialer (tel:)</option><option value="exotel">Exotel</option></select></label>
        <label className="text-xs">Account SID<input name="exotel_sid" defaultValue={s.exotel_sid} className="input" /></label>
        <label className="text-xs">API key<input name="exotel_key" defaultValue={s.exotel_key} className="input" /></label>
        <label className="text-xs">API token {stored(s.exotel_token)}<input name="exotel_token" type="password" placeholder="Paste to replace" className="input" autoComplete="off" /></label>
        <label className="text-xs">API host<select name="exotel_subdomain" defaultValue={s.exotel_subdomain || "api.exotel.com"} className="input"><option>api.exotel.com</option><option>api.in.exotel.com</option></select></label>
        <label className="text-xs">Caller ID (ExoPhone)<input name="exotel_callerid" defaultValue={s.exotel_callerid} className="input" /></label>
        <p className="text-xs text-slate-500 sm:col-span-3">Agents need their phone number on the Team page. The status callback
          <code className="rounded bg-slate-100 px-1">{origin}/api/telephony/callback?token=…</code> is sent with each call automatically; duration, status and the recording are saved
          to the call and recordings play on the lead page. Record calls only where lawful and disclosed to the customer.</p>
        <div><button className="btn">Save telephony</button></div>
      </form>

      <section className="card space-y-2">
        <h2 className="h2">REST API</h2>
        <p className="text-sm">Header <code className="rounded bg-slate-100 px-1">x-api-key: {s.api_key}</code> · Full reference: <code>docs/API.md</code></p>
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs">{`POST ${origin}/api/leads   {"name":"…","mobile":"98…","email":"…","source":"Website","campaign_name":"…"}
GET  ${origin}/api/leads?q=…&source=…&from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&limit=100
GET  ${origin}/api/health`}</pre>
        <form action={regenerateApiKey}><button className="btn-ghost">Regenerate API key</button></form>
      </section>
    </>
  );
}

async function Notifications({ s, origin }: { s: Record<string, string>; origin: string }) {
  const log = await q("SELECT m.*, l.name lead, u.name user FROM message_logs m LEFT JOIN leads l ON l.id=m.lead_id LEFT JOIN users u ON u.id=m.user_id ORDER BY m.id DESC LIMIT 50");
  return (
    <>
      <form action={saveChannels} className="card grid gap-2 sm:grid-cols-3">
        <h2 className="h2 sm:col-span-3">Email (SMTP)</h2>
        <label className="text-xs">SMTP host<input name="smtp_host" defaultValue={s.smtp_host} placeholder="smtp.gmail.com" className="input" /></label>
        <label className="text-xs">Port<input name="smtp_port" defaultValue={s.smtp_port || "587"} className="input" /></label>
        <label className="text-xs">From address<input name="smtp_from" defaultValue={s.smtp_from} placeholder="CRM <crm@getondeal.com>" className="input" /></label>
        <label className="text-xs">Username<input name="smtp_user" defaultValue={s.smtp_user} className="input" autoComplete="off" /></label>
        <label className="text-xs">Password {stored(s.smtp_pass)}<input name="smtp_pass" type="password" placeholder="Paste to replace" className="input" autoComplete="off" /></label>
        <div />
        <h2 className="h2 mt-2 sm:col-span-3">SMS (any HTTP gateway)</h2>
        <label className="text-xs sm:col-span-2">Gateway webhook URL — receives POST {`{"to":"91…","message":"…"}`}<input name="sms_webhook_url" defaultValue={s.sms_webhook_url} className="input" /></label>
        <div />
        <h2 className="h2 mt-2 sm:col-span-3">WhatsApp Cloud API</h2>
        <label className="text-xs">Phone number ID<input name="wa_phone_id" defaultValue={s.wa_phone_id} className="input" /></label>
        <label className="text-xs">Access token {stored(s.wa_token)}<input name="wa_token" type="password" placeholder="Paste to replace" className="input" autoComplete="off" /></label>
        <label className="text-xs">Template language<input name="wa_template_lang" defaultValue={s.wa_template_lang || "en"} className="input" /></label>
        <label className="text-xs">Staff notification template (1 body variable)<input name="wa_notify_template" defaultValue={s.wa_notify_template} className="input" /></label>
        <label className="text-xs">New-lead welcome template (variable = lead name)<input name="wa_welcome_template" defaultValue={s.wa_welcome_template} className="input" /></label>
        <label className="text-xs">Webhook verify token<input name="wa_verify_token" defaultValue={s.wa_verify_token} className="input" /></label>
        <p className="text-xs text-slate-500 sm:col-span-3">Inbound webhook: <code className="rounded bg-slate-100 px-1">{origin}/api/whatsapp/webhook</code> (field <code>messages</code>; signed with the Meta app secret).
          Customer replies land on the lead timeline; a new number creates a WhatsApp lead. Messages go only to leads with consent, not on DND, whose preference allows WhatsApp.</p>
        <div><button className="btn">Save channels</button></div>
      </form>
      <section className="card space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="h2 mb-0">Test & log</h2>
          {["email", "whatsapp"].map((c) => <form key={c} action={testChannel}><input type="hidden" name="channel" value={c} /><button className="btn-ghost">Send me a test {c}</button></form>)}
          {s.channels_last_test && <span className="text-sm">{s.channels_last_test}</span>}
        </div>
        <p className="text-xs text-slate-500">In-app notifications always appear. Each person picks extra channels on their Notifications page (or an admin on the Team page).</p>
        <div className="max-h-80 overflow-auto">
          <table className="tbl">
            <thead><tr><th>When</th><th>Channel</th><th>Dir</th><th>To</th><th>Lead / user</th><th>Message</th><th>Status</th></tr></thead>
            <tbody>{log.map((m) => (
              <tr key={m.id}><td className="whitespace-nowrap">{fmtDate(m.created_at)}</td><td>{m.channel}</td><td>{m.direction}</td><td>{m.to_addr}</td>
                <td>{m.lead_id ? <a className="link" href={`/leads/${m.lead_id}`}>{m.lead}</a> : m.user}</td><td className="text-xs">{m.body}</td>
                <td className={m.status === "failed" ? "text-red-600" : ""}>{m.status}{m.error && <div className="text-xs">{m.error}</div>}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}

async function Data({ s, superAdmin }: { s: Record<string, string>; superAdmin: boolean }) {
  const backups = await listBackups();
  return (
    <>
      <form action={saveSettings} className="card grid gap-3 sm:grid-cols-4">
        <input type="hidden" name="_flags" value="backup_enabled" />
        <h2 className="h2 sm:col-span-4">Automated backups</h2>
        <div className="flex items-end"><Check name="backup_enabled" label="Daily backup (mysqldump, gzipped)" on={s.backup_enabled === "1"} /></div>
        <label className="text-xs">Run at<input name="backup_time" type="time" defaultValue={s.backup_time || "02:00"} className="input" /></label>
        <label className="text-xs">Keep for (days)<input name="backup_keep_days" type="number" min="1" defaultValue={s.backup_keep_days || "14"} className="input" /></label>
        <div className="flex items-end"><button className="btn">Save</button></div>
        <p className="text-xs text-slate-500 sm:col-span-4">Files are written to <code>BACKUP_DIR</code> (default <code>./backups</code>) on the app server — copy them off-server (S3 / another region)
          for disaster recovery. Restore: <code>npm run db:restore -- backups/&lt;file&gt;.sql.gz --yes</code>. See docs/DEPLOYMENT.md.</p>
      </form>
      <section className="card space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <form action={backupNow}><button className="btn-ghost">Back up now</button></form>
          {s.backup_last_msg && <span className="text-sm">{s.backup_last_msg}</span>}
        </div>
        <table className="tbl">
          <thead><tr><th>Backup file</th><th>Size</th><th>Created</th><th /></tr></thead>
          <tbody>{backups.map((b) => (
            <tr key={b.name}><td>{b.name}</td><td>{(b.size / 1048576).toFixed(2)} MB</td><td>{new Date(b.mtime).toLocaleString("en-IN")}</td>
              <td>{superAdmin && <a className="link" href={`/api/backups/${encodeURIComponent(b.name)}`}>Download</a>}</td></tr>
          ))}</tbody>
        </table>
        {!backups.length && <p className="text-sm text-slate-500">No backups yet.</p>}
      </section>

      <form action={saveSettings} className="card grid gap-3 sm:grid-cols-4">
        <h2 className="h2 sm:col-span-4">Data retention policy</h2>
        <label className="text-xs">Delete read notifications after (days)<input name="retention_notifications_days" type="number" min="7" defaultValue={s.retention_notifications_days || "90"} className="input" /></label>
        <label className="text-xs">Delete sync / error / message logs after (days)<input name="retention_logs_days" type="number" min="30" defaultValue={s.retention_logs_days || "180"} className="input" /></label>
        <label className="text-xs">Anonymise Lost leads after (months, 0 = never)<input name="retention_lost_months" type="number" min="0" defaultValue={s.retention_lost_months || "0"} className="input" /></label>
        <div className="flex items-end"><button className="btn">Save</button></div>
        <p className="text-xs text-slate-500 sm:col-span-4">Runs daily at 03:00. Audit logs and sales/payment records are kept (financial and accountability records). Anonymising erases name, phone,
          email, notes and recordings but keeps the record so reports stay correct. Single leads can be anonymised on request from the lead page.</p>
      </form>
      <section className="card flex flex-wrap items-center gap-2">
        <form action={retentionNow}><button className="btn-ghost">Run retention now</button></form>
        {s.retention_last_msg && <span className="text-sm">{s.retention_last_msg}</span>}
      </section>

      <section className="card space-y-2">
        <h2 className="h2">Lead scoring & conversion prediction</h2>
        <p className="text-xs text-slate-500">Each open lead gets a win probability from your own history — how often leads that reached its stage converted, adjusted for how its
          source and category convert — and a 0–100 score (probability, priority, engagement, recency). The calling queue uses the score to order leads. Recomputed hourly.</p>
        <div className="flex flex-wrap items-center gap-2">
          <form action={recomputeScoresAction}><button className="btn-ghost">Recalculate now</button></form>
          {s.scoring_last && <span className="text-sm">{s.scoring_last}</span>}
        </div>
      </section>
    </>
  );
}

async function System({ s }: { s: Record<string, string> }) {
  const [errors, jobs, counts] = await Promise.all([
    q("SELECT * FROM error_logs ORDER BY id DESC LIMIT 100"),
    q("SELECT j.*, u.name user FROM jobs j LEFT JOIN users u ON u.id=j.created_by ORDER BY j.id DESC LIMIT 20"),
    q(`SELECT (SELECT COUNT(*) FROM error_logs WHERE created_at > NOW() - INTERVAL 1 DAY) err24,
        (SELECT COUNT(*) FROM jobs WHERE status IN ('queued','running')) jobs_active,
        (SELECT COUNT(*) FROM meta_sync_logs WHERE status='failed') meta_failed,
        (SELECT COUNT(*) FROM message_logs WHERE status='failed' AND created_at > NOW() - INTERVAL 1 DAY) msg_failed,
        (SELECT COUNT(*) FROM leads) leads,
        (SELECT ROUND(SUM(data_length+index_length)/1048576,1) FROM information_schema.TABLES WHERE table_schema=DATABASE()) db_mb`),
  ]);
  const c = counts[0];
  const age = s.automation_last_run ? secondsSince(s.automation_last_run) : null;
  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[["Automation", age == null ? "never ran" : age < 180 ? `ok (${age}s ago)` : `STALLED (${Math.round(age / 60)} min)`],
          ["Errors (24h)", c.err24], ["Jobs running/queued", c.jobs_active], ["Meta sync failures", c.meta_failed], ["Failed messages (24h)", c.msg_failed],
          ["Database", `${Number(c.leads).toLocaleString("en-IN")} leads · ${c.db_mb} MB`]].map(([l, v]) => (
          <div key={String(l)} className="card p-3"><div className="text-xs text-slate-500">{l}</div><div className="mt-1 font-semibold">{String(v)}</div></div>
        ))}
      </section>
      <p className="text-xs text-slate-500">Uptime monitors (UptimeRobot, Better Stack, etc.) should poll <code>/api/health</code> — it returns 503 if the database is down or automation has stalled.</p>
      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between"><h2 className="h2">Recent background jobs</h2><Link className="link text-sm" href="/jobs">All jobs →</Link></div>
        <table className="tbl">
          <thead><tr><th>#</th><th>Type</th><th>By</th><th>Status</th><th>Progress</th><th>Created</th><th>Error</th></tr></thead>
          <tbody>{jobs.map((j) => (
            <tr key={j.id}><td>{j.id}</td><td>{j.type}</td><td>{j.user}</td><td>{j.status}</td><td>{j.progress}/{j.total}</td><td>{fmtDate(j.created_at)}</td><td className="text-xs text-red-600">{j.error}</td></tr>
          ))}</tbody>
        </table>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="h2">Error log</h2>
        <table className="tbl">
          <thead><tr><th>When</th><th>Source</th><th>Message</th><th>Context</th></tr></thead>
          <tbody>{errors.map((e) => (
            <tr key={e.id}><td className="whitespace-nowrap">{fmtDate(e.created_at)}</td><td>{e.source}</td><td className="text-sm">{e.message}</td><td className="max-w-md truncate text-xs text-slate-500">{e.context}</td></tr>
          ))}</tbody>
        </table>
        {!errors.length && <p className="text-sm text-slate-500">No errors logged. 🎉</p>}
      </section>
    </>
  );
}
