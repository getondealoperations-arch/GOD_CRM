// Usage: node --env-file-if-exists=.env.local scripts/restore.mjs backups/getondeal-YYYYMMDDHHMM.sql.gz [--yes]
// Restores a gzipped mysqldump into DATABASE_URL's database. OVERWRITES the current data — stop the app first.
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

const file = process.argv[2];
if (!file) { console.error("Usage: node scripts/restore.mjs <backup.sql.gz> [--yes]"); process.exit(1); }
const url = new URL(process.env.DATABASE_URL ?? "mysql://root@localhost:3306/getondeal_crm");
const db = url.pathname.slice(1);
if (!process.argv.includes("--yes")) {
  console.error(`This will overwrite database "${db}" on ${url.hostname} with ${file}.\nRe-run with --yes to proceed.`);
  process.exit(1);
}
const mysql = spawn(process.env.MYSQL ?? "mysql", ["-h", url.hostname, "-P", url.port || "3306", "-u", decodeURIComponent(url.username), db],
  { env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }, stdio: ["pipe", "inherit", "inherit"] });
const done = new Promise((res) => mysql.on("close", res));
await pipeline(createReadStream(file), createGunzip(), mysql.stdin);
const code = await done;
if (code !== 0) { console.error("Restore failed"); process.exit(Number(code)); }
console.log(`Restored ${file} into "${db}". Run "npm run db:setup" to apply any newer migrations.`);
