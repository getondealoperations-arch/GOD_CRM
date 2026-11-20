// Usage: DATABASE_URL=mysql://…/getondeal_perf node scripts/seed-volume.mjs 100000
// Bulk-inserts N synthetic leads (+ ~2 calls each) into an EXISTING CRM database for performance testing.
// Run `npm run db:demo` against that database first. Never point this at production.
import mysql from "mysql2/promise";

const N = Number(process.argv[2] ?? 100000);
const url = process.env.DATABASE_URL ?? "";
if (!/perf|test|staging/i.test(url)) { console.error("Refusing: DATABASE_URL must name a perf/test/staging database"); process.exit(1); }
const c = await mysql.createConnection({ uri: url });
const [stages] = await c.query("SELECT id FROM stages ORDER BY position");
const [users] = await c.query("SELECT id FROM users WHERE role IN ('calling_executive','sales_executive')");
const [camps] = await c.query("SELECT id, name, channel FROM campaigns");
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const [[{ m }]] = await c.query("SELECT COALESCE(MAX(id),0) m FROM leads");
const t0 = Date.now();
for (let done = 0; done < N; done += 2000) {
  const rows = [];
  for (let i = 0; i < Math.min(2000, N - done); i++) {
    const n = m + done + i + 1, camp = pick(camps), created = new Date(Date.now() - Math.random() * 180 * 864e5);
    rows.push([`GOD-${String(n).padStart(6, "0")}`, `Perf Lead ${n}`, `9${String(100000000 + n).slice(-9)}`, `perf${n}@example.com`, pick(["Retail", "Education", "Real Estate", "Healthcare"]),
      pick(["Mumbai", "Pune", "Delhi", "Bengaluru", "Hyderabad"]), "Meta Lead Ads", camp.channel, camp.id, camp.name, pick(users).id, pick(["hot", "high", "medium", "low"]),
      pick(stages).id, Math.floor(Math.random() * 4), created, created, Math.floor(Math.random() * 100)]);
  }
  await c.query(`INSERT INTO leads (lead_code,name,mobile,email,category,city,source,channel,campaign_id,campaign_name,owner_id,priority,stage_id,total_calls,
    created_at,stage_changed_at,score) VALUES ?`, [rows]);
  await c.query(`INSERT INTO calls (lead_id,user_id,started_at,ended_at,duration_sec,disposition)
    SELECT id, owner_id, created_at + INTERVAL 1 HOUR, created_at + INTERVAL 65 MINUTE, 300, 'Connected' FROM leads WHERE id > ? AND id <= ? AND total_calls > 0`,
    [m + done, m + done + rows.length]);
  process.stdout.write(`\r${done + rows.length}/${N} leads`);
}
console.log(`\nSeeded ${N} leads in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await c.end();
