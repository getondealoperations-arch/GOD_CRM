import mysql, { type ResultSetHeader } from "mysql2/promise";

const g = globalThis as unknown as { _pool?: mysql.Pool };

export const pool =
  g._pool ??
  (g._pool = mysql.createPool({
    uri: process.env.DATABASE_URL ?? "mysql://root@localhost:3306/getondeal_crm",
    connectionLimit: Number(process.env.DB_POOL_SIZE ?? 20), // pages run their queries in parallel; see docs/PERFORMANCE.md
    dateStrings: true,
    decimalNumbers: true,
  }));

type Param = string | number | boolean | null | Date | undefined | (string | number)[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

const clean = (params: Param[]) => params.map((p) => (p === undefined ? null : p));

export async function q<T = Row>(sql: string, params: Param[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, clean(params));
  return rows as T[];
}

export async function one<T = Row>(sql: string, params: Param[] = []): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}

export async function exec(sql: string, params: Param[] = []): Promise<ResultSetHeader> {
  const [res] = await pool.query(sql, clean(params));
  return res as ResultSetHeader;
}

export async function getSetting(k: string, fallback = ""): Promise<string> {
  return (await one<{ v: string }>("SELECT v FROM settings WHERE k=?", [k]))?.v ?? fallback;
}

export async function setSetting(k: string, v: string) {
  await exec("INSERT INTO settings (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)", [k, v]);
}

export async function audit(userId: number | null, action: string, entity: string, entityId: string | number | null, details?: unknown) {
  await exec("INSERT INTO audit_logs (user_id,action,entity,entity_id,details) VALUES (?,?,?,?,?)", [
    userId, action, entity, entityId == null ? null : String(entityId), details == null ? null : JSON.stringify(details),
  ]);
}

/** In-app notification, then fan-out to the user's chosen channels (email / WhatsApp / SMS) in the background. */
export async function notify(userId: number | null | undefined, title: string, link?: string) {
  if (!userId) return;
  await exec("INSERT INTO notifications (user_id,title,link) VALUES (?,?,?)", [userId, title.slice(0, 255), link ?? null]);
  import("./channels").then((c) => c.deliver(userId, title, link)).catch((e) => logError("notify", e));
}

/** Persist an error for Settings → System health. Never throws. */
export async function logError(source: string, e: unknown, context?: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`[${source}]`, message);
  try {
    await exec("INSERT INTO error_logs (source,message,context) VALUES (?,?,?)",
      [source.slice(0, 60), message.slice(0, 5000), context == null ? null : JSON.stringify(context).slice(0, 5000)]);
  } catch { /* DB down: console only */ }
}
