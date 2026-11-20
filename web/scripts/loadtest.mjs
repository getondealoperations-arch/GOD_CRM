// Usage: node scripts/loadtest.mjs http://localhost:3100 <email> <password> [concurrency=20] [seconds=30]
// Logs in once, then N virtual users hit the main screens in a loop. Reports throughput and latency percentiles per route.
const [base, email, password, conc = "20", secs = "30"] = process.argv.slice(2);
if (!base || !email || !password) { console.error("Usage: node scripts/loadtest.mjs <baseUrl> <email> <password> [concurrency] [seconds]"); process.exit(1); }

// Log in through the real login form (server action) to get a session cookie
const jar = (r) => (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const page = await fetch(`${base}/login`);
const html = await page.text();
const action = html.match(/name="(\$ACTION_ID_[a-f0-9]+)"/)?.[1];
const fd = new FormData();
fd.set(action, ""); fd.set("email", email); fd.set("password", password);
const login = await fetch(`${base}/login`, { method: "POST", body: fd, redirect: "manual", headers: { cookie: jar(page) } });
const cookie = jar(login);
if (!cookie.includes("god_session")) { console.error("Login failed"); process.exit(1); }

const ROUTES = ["/", "/leads", "/leads?q=Perf%20Lead%2099", "/leads?sort=score&page=50", "/pipeline", "/calling", "/followups", "/reports?report=campaign", "/reports?report=employee", "/api/leads?limit=100"];
const stats = Object.fromEntries(ROUTES.map((r) => [r, { t: [], err: 0 }]));
const end = Date.now() + Number(secs) * 1000;
async function worker(i) {
  for (let k = i; Date.now() < end; k++) {
    const r = ROUTES[k % ROUTES.length];
    const t = performance.now();
    try { const res = await fetch(base + r, { headers: { cookie } }); await res.arrayBuffer(); if (!res.ok) stats[r].err++; }
    catch { stats[r].err++; }
    stats[r].t.push(performance.now() - t);
  }
}
await Promise.all(Array.from({ length: Number(conc) }, (_, i) => worker(i)));
const pc = (a, p) => a.length ? a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(0) : "-";
let total = 0;
console.log(`\n${conc} concurrent users for ${secs}s against ${base}\n`);
console.log("route".padEnd(30), "req".padStart(6), "p50ms".padStart(7), "p95ms".padStart(7), "p99ms".padStart(7), "errors".padStart(7));
for (const r of ROUTES) { const s = stats[r]; total += s.t.length; console.log(r.padEnd(30), String(s.t.length).padStart(6), pc(s.t, .5).padStart(7), pc(s.t, .95).padStart(7), pc(s.t, .99).padStart(7), String(s.err).padStart(7)); }
const all = ROUTES.flatMap((r) => stats[r].t);
console.log(`\nTotal ${total} requests, ${(total / Number(secs)).toFixed(1)} req/s, overall p50 ${pc(all, .5)}ms p95 ${pc(all, .95)}ms`);
