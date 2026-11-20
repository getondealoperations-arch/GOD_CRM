// Background jobs (SRS §18): bulk imports and large exports run outside the request.
// ponytail: MySQL-backed queue processed in-process, one job at a time. Claiming is an atomic UPDATE, so several
// app instances can share the table safely. Move to a dedicated queue (BullMQ/SQS) only if jobs need parallelism.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { rolePerms, type Role, type User } from "./auth";
import { exec, logError, one, q } from "./db";
import { leadWhere, type SP } from "./filters";
import { importRows } from "./importer";
import { parseSheet, toCsv, toXlsx, type Column } from "./sheet";

export const STORAGE = process.env.STORAGE_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "storage");

export async function saveUpload(file: File) {
  const dir = path.join(STORAGE, "uploads");
  await mkdir(dir, { recursive: true });
  const p = path.join(dir, `${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`);
  await writeFile(p, Buffer.from(await file.arrayBuffer()));
  return p;
}

export async function enqueue(type: string, payload: unknown, userId: number, total = 0) {
  const r = await exec("INSERT INTO jobs (type,payload,created_by,total) VALUES (?,?,?,?)", [type, JSON.stringify(payload), userId, total]);
  void kick();
  return r.insertId;
}

async function jobUser(id: number): Promise<User> {
  const u = await one<Omit<User, "perms">>("SELECT id,name,email,role,team_id,vertical FROM users WHERE id=?", [id]);
  if (!u) throw new Error("Job owner no longer exists");
  return { ...u, perms: await rolePerms(u.role as Role) };
}

type Job = { id: number; type: string; payload: string; created_by: number };
const progress = (id: number) => async (n: number) => { await exec("UPDATE jobs SET progress=? WHERE id=?", [n, id]); };

const HANDLERS: Record<string, (j: Job, p: Record<string, unknown>) => Promise<{ result?: unknown; file?: string }>> = {
  async import(j, p) {
    const buf = await readFile(String(p.file));
    const sheet = await parseSheet(new File([buf], String(p.fileName)));
    await exec("UPDATE jobs SET total=? WHERE id=?", [sheet.rows.length, j.id]);
    const result = await importRows({ rows: sheet.rows, mapping: p.mapping as Record<string, string>, dupMode: String(p.dupMode), mode: "import",
      userId: j.created_by, fileName: String(p.fileName), onProgress: progress(j.id) });
    return { result: { ...result, failedRows: result.failedRows.slice(0, 20000) } };
  },
  async export_leads(j, p) {
    const { LEAD_COLS, leadExportRows } = await import("./export");
    const u = await jobUser(j.created_by);
    const rows = await leadExportRows(u, p.sp as SP, !!p.masked);
    const fmt = p.format === "xlsx" ? "xlsx" : "csv";
    const dir = path.join(STORAGE, "exports");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `job-${j.id}-leads.${fmt}`);
    await writeFile(file, fmt === "xlsx" ? await toXlsx(LEAD_COLS as Column[], rows) : toCsv(LEAD_COLS as Column[], rows));
    return { result: { rows: rows.length }, file };
  },
};

let running = false;
/** Process queued jobs until none are left. Safe to call often; only one loop runs per process. */
export async function kick() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const next = await one<Job>("SELECT id, type, payload, created_by FROM jobs WHERE status='queued' ORDER BY id LIMIT 1");
      if (!next) break;
      const claimed = await exec("UPDATE jobs SET status='running', started_at=NOW() WHERE id=? AND status='queued'", [next.id]);
      if (claimed.affectedRows !== 1) continue; // another instance took it
      try {
        const h = HANDLERS[next.type];
        if (!h) throw new Error(`Unknown job type ${next.type}`);
        const out = await h(next, JSON.parse(next.payload || "{}"));
        await exec("UPDATE jobs SET status='done', progress=total, result=?, file_path=?, finished_at=NOW() WHERE id=?",
          [JSON.stringify(out.result ?? null), out.file ?? null, next.id]);
      } catch (e) {
        await exec("UPDATE jobs SET status='failed', error=?, finished_at=NOW() WHERE id=?", [(e as Error).message, next.id]);
        await logError(`job:${next.type}`, e, { job: next.id });
      }
    }
  } finally { running = false; }
}

/** On boot: jobs left 'running' by a crash/restart are marked failed (visible, re-runnable), never silently lost. */
export async function recoverInterrupted() {
  await exec("UPDATE jobs SET status='failed', error='Interrupted by a server restart — run it again', finished_at=NOW() WHERE status='running'");
}

export const listJobs = (userId: number | null) =>
  q(`SELECT j.id, j.type, j.status, j.progress, j.total, j.error, j.file_path, j.result, j.created_at, j.finished_at, u.name user
     FROM jobs j LEFT JOIN users u ON u.id=j.created_by ${userId ? "WHERE j.created_by=?" : ""} ORDER BY j.id DESC LIMIT 100`, userId ? [userId] : []);
