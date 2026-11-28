import { getSetting, setSetting } from "./db";

/** A pending "create account" request from /employee/signup. The password is already hashed; no user row exists until an admin approves. */
export type AccessRequest = { name: string; email: string; phone: string | null; password_hash: string; requested_at: string };

const KEY = "access_requests";
export const MAX_PENDING = 100;

// ponytail: requests live as one JSON value in `settings` so no database migration is needed (the live DB is only migrated by hand).
// Two requests landing in the same instant could drop one; move to its own table if volume ever makes that matter.
export async function listRequests(): Promise<AccessRequest[]> {
  try {
    const v = JSON.parse(await getSetting(KEY, "[]"));
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export const saveRequests = (list: AccessRequest[]) => setSetting(KEY, JSON.stringify(list));
