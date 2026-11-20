// Usage: node --env-file-if-exists=.env.local scripts/backup.mjs
// Same as Settings → Backups → "Back up now", for cron / CI use: writes BACKUP_DIR/getondeal-<stamp>.sql.gz
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

const url = new URL(process.env.DATABASE_URL ?? "mysql://root@localhost:3306/getondeal_crm");
const dir = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `getondeal-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}.sql.gz`);
const dump = spawn(process.env.MYSQLDUMP ?? "mysqldump", ["--single-transaction", "--routines", "--no-tablespaces", "-h", url.hostname,
  "-P", url.port || "3306", "-u", decodeURIComponent(url.username), url.pathname.slice(1)],
  { env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }, stdio: ["ignore", "pipe", "inherit"] });
const done = new Promise((res) => dump.on("close", res));
await pipeline(dump.stdout, createGzip(), createWriteStream(file));
if ((await done) !== 0) { console.error("Backup failed"); process.exit(1); }
console.log(file);
