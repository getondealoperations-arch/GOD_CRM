import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { can, currentUser } from "@/lib/auth";
import { getSetting } from "@/lib/db";
import { oauthUrl } from "@/lib/meta";

/** Start "Connect with Facebook". The state cookie protects the callback against CSRF. */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || !can(u, "settings.manage")) return new Response("Forbidden", { status: 403 });
  const origin = (process.env.APP_URL || (await getSetting("app_url")) || new URL(req.url).origin).replace(/\/$/, "");
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("meta_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https"), maxAge: 600, path: "/" });
  try {
    return Response.redirect(await oauthUrl(`${origin}/api/meta/callback`, state), 302);
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
