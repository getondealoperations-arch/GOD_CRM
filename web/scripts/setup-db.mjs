// Usage: node scripts/setup-db.mjs [--demo]
// Creates the database, applies db/schema.sql, seeds stages/settings/admin. --demo adds synthetic sample data.
import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

const url = new URL(process.env.DATABASE_URL ?? "mysql://root@localhost:3306/getondeal_crm");
const dbName = url.pathname.slice(1);
const demo = process.argv.includes("--demo");

const hash = (pw) => { const s = randomBytes(16).toString("hex"); return `${s}:${scryptSync(pw, s, 64).toString("hex")}`; };

const conn = await mysql.createConnection({
  host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password), multipleStatements: true,
});
await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await conn.query(`USE \`${dbName}\``);
await conn.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
await migrate();

const [[{ n: stageCount }]] = await conn.query("SELECT COUNT(*) n FROM stages");
if (!stageCount) {
  const stages = [
    ["New Lead", "#64748b"], ["Assigned", "#6366f1"], ["First Contact Attempted", "#8b5cf6"], ["Connected", "#0ea5e9"],
    ["Interested", "#14b8a6"], ["Qualified", "#22c55e", 0, 0, 1], ["Meeting / Demo Scheduled", "#84cc16"], ["Negotiation", "#eab308"],
    ["Payment Pending", "#f97316"], ["Converted / Won", "#16a34a", 1], ["Lost", "#dc2626", 0, 1], ["Nurture / Future Follow-up", "#a855f7"],
  ];
  for (const [i, [name, color, won = 0, lost = 0, qual = 0]] of stages.entries())
    await conn.query("INSERT INTO stages (name,position,color,is_won,is_lost,is_qualified) VALUES (?,?,?,?,?,?)", [name, i + 1, color, won, lost, qual]);
}

const defaults = {
  sla_minutes: "15", escalate_after_minutes: "60", inactivity_days: "7", work_start: "09:00", work_end: "20:00",
  duplicate_rule: "mobile_or_email", assign_mode: "round_robin", mask_exports: "0",
  priorities: "hot,high,medium,low", attribution_model: "last_touch", reassign_unavailable: "1",
  rule_auto_assign: "1", rule_sla: "1", rule_reminders: "1", rule_escalation: "1", rule_interested: "1", rule_reactivation: "1", rule_wa_welcome: "0",
  backup_enabled: "0", backup_time: "02:00", backup_keep_days: "14",
  retention_notifications_days: "90", retention_logs_days: "180", retention_lost_months: "0",
  tel_provider: "none", tel_callback_token: randomBytes(16).toString("hex"), wa_verify_token: randomBytes(12).toString("hex"),
  meta_verify_token: randomBytes(12).toString("hex"), api_key: randomBytes(24).toString("hex"),
};
for (const [k, v] of Object.entries(defaults)) await conn.query("INSERT IGNORE INTO settings (k,v) VALUES (?,?)", [k, v]);

const [[{ n: userCount }]] = await conn.query("SELECT COUNT(*) n FROM users");
if (!userCount) {
  const pw = process.env.ADMIN_PASSWORD ?? "Admin@123";
  await conn.query("INSERT INTO users (name,email,password_hash,role) VALUES ('Super Admin','admin@getondeal.local',?,'super_admin')", [hash(pw)]);
  console.log(`Super admin: admin@getondeal.local / ${pw}  (change after first login)`);
}

if (demo) await seedDemo();
// first-touch history for leads created before lead_touches existed
await conn.query(`INSERT INTO lead_touches (lead_id, campaign_id, source, channel, adset_name, ad_name, touched_at)
  SELECT id, campaign_id, source, channel, adset_name, ad_name, created_at FROM leads l
  WHERE NOT EXISTS (SELECT 1 FROM lead_touches t WHERE t.lead_id=l.id)`);
await conn.end();
console.log(`Database "${dbName}" ready.`);

async function seedDemo() {
  const [[{ n }]] = await conn.query("SELECT COUNT(*) n FROM leads");
  if (n) return console.log("Leads exist — skipping demo data.");
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const daysAgo = (d, h = rnd(9, 19)) => { const t = new Date(Date.now() - d * 864e5); t.setHours(h, rnd(0, 59), 0, 0); return t; };
  const pw = hash("Password@123");

  const [t1] = await conn.query("INSERT INTO teams (name, department) VALUES ('Calling Team A','Inside Sales')");
  const [t2] = await conn.query("INSERT INTO teams (name, department) VALUES ('Field Sales','Sales')");
  const mk = async (name, email, role, team) => {
    const ex = role.includes("executive");
    const [r] = await conn.query(
      "INSERT INTO users (name,email,password_hash,role,team_id,target_calls,target_followups,target_conversions) VALUES (?,?,?,?,?,?,?,?)",
      [name, email, pw, role, team, ex ? 60 : 0, ex ? 20 : 0, ex ? 2 : 0]);
    return r.insertId;
  };
  const mgr = await mk("Sales Manager", "manager@getondeal.local", "sales_manager", null);
  const tl = await mk("Team Leader", "leader@getondeal.local", "team_leader", t1.insertId);
  const callers = [
    await mk("Calling Exec 1", "caller1@getondeal.local", "calling_executive", t1.insertId),
    await mk("Calling Exec 2", "caller2@getondeal.local", "calling_executive", t1.insertId),
    await mk("Calling Exec 3", "caller3@getondeal.local", "calling_executive", t1.insertId),
  ];
  const sellers = [
    await mk("Sales Exec 1", "sales1@getondeal.local", "sales_executive", t2.insertId),
    await mk("Sales Exec 2", "sales2@getondeal.local", "sales_executive", t2.insertId),
  ];
  const mkt = await mk("Marketing Manager", "marketing@getondeal.local", "marketing_manager", null);
  await mk("Management Viewer", "viewer@getondeal.local", "viewer", null);
  await conn.query("UPDATE teams SET leader_id=? WHERE id=?", [tl, t1.insertId]);
  await conn.query("UPDATE teams SET leader_id=? WHERE id=?", [mgr, t2.insertId]);
  await conn.query("UPDATE users SET manager_id=? WHERE role IN ('team_leader','sales_executive')", [mgr]);
  await conn.query("UPDATE users SET manager_id=? WHERE role='calling_executive'", [tl]);

  const camps = [
    ["Diwali Offer – Lead Form", "Facebook Ads", 150000, "Restaurants"], ["Reels Awareness", "Instagram Ads", 80000, "Salons"],
    ["Search – Brand", "Google Ads", 120000, "Retail"], ["Influencer Collab Q4", "Influencer Marketing", 60000, "Fitness"],
    ["Referral Program", "Referrals", 20000, "Retail"],
  ];
  const campIds = [];
  for (const [name, channel, budget, cat] of camps) {
    const [r] = await conn.query(
      "INSERT INTO campaigns (name,channel,budget,category,owner_id,start_date,objective) VALUES (?,?,?,?,?,CURDATE()-INTERVAL 30 DAY,'Lead generation')",
      [name, channel, budget, cat, mkt]);
    campIds.push({ id: r.insertId, name, channel, cat });
    for (let d = 0; d < 30; d++)
      await conn.query("INSERT INTO spend_entries (campaign_id,spend_date,amount,source,created_by) VALUES (?,CURDATE()-INTERVAL ? DAY,?,'manual',?)",
        [r.insertId, d, Math.round((budget / 30) * (0.7 + Math.random() * 0.6)), mkt]);
  }

  const [stages] = await conn.query("SELECT * FROM stages ORDER BY position");
  const weights = [3, 8, 12, 10, 10, 6, 5, 4, 3, 8, 12, 5];
  const pool = stages.flatMap((s, i) => Array(weights[i] ?? 1).fill(s));
  const first = ["Aarav", "Vivaan", "Aditya", "Diya", "Isha", "Kabir", "Meera", "Rohan", "Sneha", "Tanvi", "Arjun", "Priya", "Neha", "Rahul", "Karan"];
  const last = ["Sharma", "Patil", "Mehta", "Iyer", "Reddy", "Gupta", "Shah", "Desai", "Kulkarni", "Nair"];
  const cities = ["Mumbai", "Pune", "Bengaluru", "Delhi", "Hyderabad", "Ahmedabad"];
  const lostReasons = ["Price too high", "Not interested", "Went with competitor", "Wrong number", "No budget"];
  const dispos = ["Not Answered", "Busy", "Switched Off", "Call Back Requested", "Follow-up Required"];
  const execs = [...callers, ...sellers];

  for (let i = 0; i < 400; i++) {
    const c = pick(campIds);
    const st = pick(pool);
    const owner = st.position === 1 ? null : pick(execs);
    const created = daysAgo(rnd(0, 29));
    const nm = `${pick(first)} ${pick(last)}`;
    const calls = st.position <= 2 ? 0 : rnd(1, 5);
    const lastContact = calls ? new Date(Math.min(Date.now(), created.getTime() + rnd(1, 72) * 36e5)) : null;
    const [r] = await conn.query(
      `INSERT INTO leads (name,mobile,email,business_name,category,city,source,channel,campaign_id,campaign_name,owner_id,assigned_at,priority,stage_id,
        stage_changed_at,total_calls,last_contact_at,lost_reason,expected_revenue,created_at,sla_alerted)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
      [nm, `98${String(10000000 + i).padStart(8, "0")}`, `${nm.toLowerCase().replace(" ", ".")}${i}@example.com`, `${nm.split(" ")[1]} Enterprises`,
        c.cat, pick(cities), ["Facebook Ads", "Instagram Ads"].includes(c.channel) ? "Meta Lead Ads" : c.channel, c.channel, c.id, c.name,
        owner, owner ? created : null, pick(["low", "medium", "medium", "high", "hot"]), st.id, lastContact ?? created, calls, lastContact,
        st.is_lost ? pick(lostReasons) : null, rnd(5, 50) * 1000, created]);
    const id = r.insertId;
    await conn.query("UPDATE leads SET lead_code=? WHERE id=?", [`GOD-${String(id).padStart(6, "0")}`, id]);
    await conn.query("INSERT INTO lead_activities (lead_id,type,message,created_at) VALUES (?,'create',?,?)", [id, "Lead created (demo data)", created]);
    if (st.is_lost) {
      // realistic path: lost after progressing part of the way, so scoring has something to learn from
      const via = stages[rnd(1, 7)];
      await conn.query("INSERT INTO stage_history (lead_id,from_stage_id,to_stage_id,user_id,seconds_in_prev,changed_at) VALUES (?,?,?,?,?,?)",
        [id, stages[0].id, via.id, owner, rnd(600, 86400 * 2), created]);
      await conn.query("INSERT INTO stage_history (lead_id,from_stage_id,to_stage_id,user_id,seconds_in_prev,changed_at) VALUES (?,?,?,?,?,?)",
        [id, via.id, st.id, owner, rnd(600, 86400 * 3), lastContact ?? created]);
    } else if (st.position > 1)
      await conn.query("INSERT INTO stage_history (lead_id,from_stage_id,to_stage_id,user_id,seconds_in_prev,changed_at) VALUES (?,?,?,?,?,?)",
        [id, stages[0].id, st.id, owner, rnd(600, 86400 * 3), lastContact ?? created]);
    for (let k = 0; k < calls; k++) {
      const at = new Date(created.getTime() + (k + 1) * rnd(1, 20) * 36e5);
      if (at > new Date()) break;
      const dur = rnd(0, 1) ? rnd(30, 600) : 0;
      const dispo = dur ? (k === calls - 1 && st.position >= 5 ? "Interested" : "Connected") : pick(dispos);
      await conn.query("INSERT INTO calls (lead_id,user_id,started_at,ended_at,duration_sec,disposition,remarks) VALUES (?,?,?,?,?,?,?)",
        [id, owner, at, new Date(at.getTime() + dur * 1000), dur, dispo, "Demo call"]);
    }
    if (!st.is_won && !st.is_lost && owner && Math.random() < 0.5) {
      const due = new Date(Date.now() + rnd(-3, 4) * 864e5 + rnd(-5, 5) * 36e5);
      await conn.query("INSERT INTO followups (lead_id,assigned_to,due_at,note,created_by,reminded,escalated) VALUES (?,?,?,?,?,1,1)",
        [id, owner, due, "Discuss pricing", owner]);
      await conn.query("UPDATE leads SET next_followup_at=? WHERE id=?", [due, id]);
    }
    if (st.is_won || st.name === "Payment Pending") {
      const value = rnd(10, 80) * 1000;
      const paid = st.is_won ? pick([value, value, Math.round(value / 2)]) : 0;
      const status = paid >= value ? "Paid" : paid ? "Partially Paid" : "Pending";
      const [s] = await conn.query(
        "INSERT INTO sales (lead_id,campaign_id,user_id,product,sale_date,order_value,gross_profit,invoice_no,status) VALUES (?,?,?,?,?,?,?,?,?)",
        [id, c.id, owner, pick(["Listing – Gold", "Listing – Platinum", "Ads Package"]), lastContact ?? created, value, Math.round(value * 0.45),
          `INV-${1000 + id}`, status]);
      if (paid) await conn.query("INSERT INTO payments (sale_id,amount,paid_at,mode,reference_id) VALUES (?,?,?,?,?)",
        [s.insertId, paid, lastContact ?? created, pick(["UPI", "Bank Transfer", "Card"]), `TXN${rnd(100000, 999999)}`]);
      await conn.query("UPDATE leads SET actual_revenue=? WHERE id=?", [value, id]);
    }
  }
  console.log("Demo data seeded. Demo users (password Password@123): manager@, leader@, caller1-3@, sales1-2@, marketing@, viewer@getondeal.local");
}

/** Brings an existing database up to the current schema. Safe to run repeatedly (MySQL 8 has no ADD COLUMN IF NOT EXISTS). */
async function migrate() {
  const cols = async (t) => {
    const [rows] = await conn.query("SELECT COLUMN_NAME c, DATA_TYPE d FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?", [dbName, t]);
    return new Map(rows.map((r) => [r.c, r.d]));
  };
  const add = {
    users: [["phone", "VARCHAR(20) NULL"], ["notify_channels", "VARCHAR(60) NOT NULL DEFAULT ''"], ["vertical", "VARCHAR(100) NULL"]],
    stages: [["allowed_next", "VARCHAR(255) NULL"]],
    spend_entries: [["adset_id", "VARCHAR(64)"], ["adset_name", "VARCHAR(190)"], ["ad_id", "VARCHAR(64)"], ["ad_name", "VARCHAR(190)"]],
    leads: [["consent_at", "DATETIME NULL"], ["consent_source", "VARCHAR(80) NULL"], ["comm_pref", "VARCHAR(60) NULL"],
      ["score", "INT NOT NULL DEFAULT 0"], ["win_prob", "DECIMAL(5,2) NULL"], ["anonymized_at", "DATETIME NULL"]],
    calls: [["provider_call_id", "VARCHAR(80) NULL"], ["call_status", "VARCHAR(30) NULL"]],
    sales: [["attribution", "VARCHAR(20) NULL"]],
  };
  for (const [t, list] of Object.entries(add)) {
    const have = await cols(t);
    for (const [c, def] of list) if (!have.has(c)) await conn.query(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`);
  }
  // ENUM → VARCHAR so priorities / activity types / sync statuses can grow without schema changes
  const widen = [["leads", "priority", "VARCHAR(30) NOT NULL DEFAULT 'medium'"], ["lead_activities", "type", "VARCHAR(20) NOT NULL"],
    ["meta_sync_logs", "status", "VARCHAR(20) NOT NULL"]];
  for (const [t, c, def] of widen) if ((await cols(t)).get(c) === "enum") await conn.query(`ALTER TABLE ${t} MODIFY ${c} ${def}`);
  // indexes found by the 100k-lead performance test (docs/PERFORMANCE.md); matched on the leading column
  const indexes = [["leads", "score", "(score)"], ["leads", "category", "(category)"], ["leads", "city", "(city)"], ["leads", "in_reactivation", "(in_reactivation)"],
    ["leads", "stage_forecast", "stage_forecast (stage_id, win_prob, expected_revenue)"], ["calls", "provider_call_id", "(provider_call_id)"], ["calls", "started_at", "(started_at)"]];
  for (const [t, name, def] of indexes) {
    const [have] = await conn.query(
      "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND (INDEX_NAME=? OR (COLUMN_NAME=? AND SEQ_IN_INDEX=1 AND INDEX_NAME<>'PRIMARY' AND ? NOT LIKE '% (%'))",
      [dbName, t, name, name, def]);
    if (!have.length) await conn.query(`ALTER TABLE ${t} ADD KEY ${def}`);
  }
}
