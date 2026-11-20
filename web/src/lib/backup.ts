// Database backups (SRS §17/§18). Uses mysqldump (or mariadb-dump) → gzip in BACKUP_DIR, prunes old files.
// Restore: `node scripts/restore.mjs <file.sql.gz>` (deliberately not exposed in the web UI).
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { getSetting, setSetting } from "./db";

export const BACKUP_DIR = process.env.BACKUP_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "backups");

export async function runBackup() {
  const url = new URL(process.env.DATABASE_URL ?? "mysql://root@localhost:3306/getondeal_crm");
  await mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const file = path.join(BACKUP_DIR, `getondeal-${stamp}.sql.gz`);
  const dump = spawn(/*turbopackIgnore: true*/ process.env.MYSQLDUMP ?? "mysqldump", [
    "--single-transaction", "--routines", "--no-tablespaces", "-h", url.hostname, "-P", url.port || "3306",
    "-u", decodeURIComponent(url.username), url.pathname.slice(1),
  ], { env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) } });
  let err = "";
  dump.stderr.on("data", (d) => (err += d));
  const exited = new Promise<number>((res) => dump.on("close", res));
  await pipeline(dump.stdout, createGzip(), createWriteStream(file));
  const code = await exited;
  if (code !== 0) { await unlink(file).catch(() => {}); throw new Error(`mysqldump failed (${code}): ${err.slice(0, 300)}`); }
  await setSetting("backup_last", `${new Date().toISOString()}|${path.basename(file)}|${(await stat(file)).size}`);
  await prune();
  return path.basename(file);
}

async function prune() {
  const keep = Number(await getSetting("backup_keep_days", "14"));
  const cutoff = Date.now() - keep * 864e5;
  for (const f of await listBackups()) if (f.mtime < cutoff) await unlink(path.join(BACKUP_DIR, f.name));
}

export async function listBackups() {
  const names = await readdir(BACKUP_DIR).catch(() => [] as string[]);
  const out = [];
  for (const name of names.filter((n) => n.endsWith(".sql.gz"))) {
    const s = await stat(path.join(BACKUP_DIR, name));
    out.push({ name, size: s.size, mtime: s.mtimeMs });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}
