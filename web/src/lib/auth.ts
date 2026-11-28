import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { getSetting, one } from "./db";

export type Role =
  | "super_admin" | "admin" | "sales_manager" | "team_leader"
  | "calling_executive" | "sales_executive" | "marketing_manager" | "viewer";

export type User = {
  id: number; name: string; email: string; role: Role; team_id: number | null;
  /** Business vertical (lead category) the user is limited to; null = all verticals. */
  vertical: string | null;
  /** Effective permissions (role defaults, or the admin's override from Settings → Permissions). */
  perms: Perm[];
};

const SECRET = process.env.APP_SECRET ?? "dev-secret-change-me-dev-secret-change-me";
const COOKIE = "god_session";
const MAX_AGE = 60 * 60 * 12;

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(pw, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

const sign = (v: string) => createHmac("sha256", SECRET).update(v).digest("base64url");

export async function startSession(userId: number) {
  const payload = `${userId}.${Date.now() + MAX_AGE * 1000}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export const currentUser = cache(async (): Promise<User | null> => {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, exp, sig] = raw.split(".");
  const expected = sign(`${id}.${exp}`);
  if (!sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) < Date.now()) return null;
  const u = await one<Omit<User, "perms">>("SELECT id,name,email,role,team_id,vertical FROM users WHERE id=? AND active=1", [Number(id)]);
  return u ? { ...u, perms: await rolePerms(u.role) } : null;
});

/** Role permissions with the admin's overrides applied. Super Admin always keeps everything (prevents lock-out). */
export async function rolePerms(role: Role): Promise<Perm[]> {
  if (role === "super_admin") return ALL;
  try {
    const o = JSON.parse((await getSetting("role_permissions")) || "{}") as Partial<Record<Role, Perm[]>>;
    if (Array.isArray(o[role])) return o[role]!.filter((p) => ALL.includes(p));
  } catch { /* bad JSON → defaults */ }
  return PERMISSIONS[role];
}

export async function requireUser(perm?: Perm): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (perm && !can(u, perm)) forbidden(); // 403 + app/forbidden.tsx (experimental.authInterrupts)
  return u;
}

// ---- Role-permission matrix (SRS §10, §17) ----
export type Perm =
  | "lead.view_all" | "lead.view_team" | "lead.edit" | "lead.create" | "lead.assign" | "lead.delete"
  | "lead.export" | "lead.import" | "campaign.manage" | "sales.manage" | "users.manage"
  | "settings.manage" | "reports.view" | "audit.view" | "calls.log";

export const ALL: Perm[] = [
  "lead.view_all", "lead.view_team", "lead.edit", "lead.create", "lead.assign", "lead.delete", "lead.export",
  "lead.import", "campaign.manage", "sales.manage", "users.manage", "settings.manage", "reports.view", "audit.view", "calls.log",
];

export const PERMISSIONS: Record<Role, Perm[]> = {
  super_admin: ALL,
  admin: ALL.filter((p) => p !== "settings.manage"),
  sales_manager: ["lead.view_all", "lead.edit", "lead.create", "lead.assign", "lead.export", "lead.import", "sales.manage", "reports.view", "calls.log"],
  team_leader: ["lead.view_team", "lead.edit", "lead.create", "lead.assign", "reports.view", "calls.log"],
  calling_executive: ["lead.edit", "lead.create", "calls.log"],
  sales_executive: ["lead.edit", "lead.create", "calls.log", "sales.manage"],
  marketing_manager: ["lead.view_all", "lead.create", "lead.import", "lead.export", "campaign.manage", "reports.view"],
  viewer: ["lead.view_all", "reports.view"],
};

export const can = (u: Pick<User, "role"> & { perms?: Perm[] }, p: Perm) => (u.perms ?? PERMISSIONS[u.role]).includes(p);

export const PERM_LABEL: Record<Perm, string> = {
  "lead.view_all": "View all leads", "lead.view_team": "View team's leads", "lead.edit": "Edit leads", "lead.create": "Create leads",
  "lead.assign": "Assign / transfer", "lead.delete": "Delete / anonymise", "lead.export": "Export", "lead.import": "Import",
  "campaign.manage": "Manage campaigns & spend", "sales.manage": "Record sales & payments", "users.manage": "Manage users & teams",
  "settings.manage": "Settings", "reports.view": "Reports & MIS", "audit.view": "Audit log", "calls.log": "Log calls",
};

/** Front-line employees: they work their own leads, so they land on "My work" and get the slim sidebar. */
export const FIELD_ROLES: Role[] = ["calling_executive", "sales_executive"];
/** Who may use the employee sign-in page (/employee/login): front-line staff and their team leaders. */
export const EMPLOYEE_PORTAL_ROLES: Role[] = [...FIELD_ROLES, "team_leader"];

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin", admin: "Admin", sales_manager: "Sales Manager", team_leader: "Team Leader",
  calling_executive: "Calling Executive", sales_executive: "Sales Executive", marketing_manager: "Marketing Manager", viewer: "Viewer / Management",
};

/** SQL fragment restricting leads (alias `l`) to what the user may see. */
export function leadScope(u: User): { sql: string; params: (number | string)[] } {
  const base: { sql: string; params: (number | string)[] } = can(u, "lead.view_all") ? { sql: "1=1", params: [] }
    : can(u, "lead.view_team") ? { sql: "(l.owner_id=? OR l.owner_id IN (SELECT id FROM users WHERE team_id=?))", params: [u.id, u.team_id ?? -1] }
    : { sql: "l.owner_id=?", params: [u.id] };
  // multi-vertical: a user tied to a vertical sees only that category (their own leads always stay visible)
  if (u.vertical) return { sql: `(${base.sql} AND (l.category=? OR l.owner_id=?))`, params: [...base.params, u.vertical, u.id] };
  return base;
}

// ---- Secret storage for Meta tokens / API credentials (AES-256-GCM) ----
const KEY = scryptSync(SECRET, "god-crm-secrets", 32);
export function encrypt(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function decrypt(blob: string) {
  if (!blob) return "";
  const [iv, tag, enc] = blob.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
