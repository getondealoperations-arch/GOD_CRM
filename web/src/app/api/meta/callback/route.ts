import { cookies } from "next/headers";
import { can, currentUser } from "@/lib/auth";
import { audit, getSetting, setSetting } from "@/lib/db";
import { exchangeCode } from "@/lib/meta";

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || !can(u, "settings.manage")) return new Response("Forbidden", { status: 403 });
  const p = new URL(req.url).searchParams;
  const jar = await cookies();
  const state = jar.get("meta_oauth_state")?.value;
  jar.delete("meta_oauth_state");
  const origin = (process.env.APP_URL || (await getSetting("app_url")) || new URL(req.url).origin).replace(/\/$/, "");
  let msg: string;
  if (!state || state !== p.get("state")) msg = "Facebook connect failed: state mismatch (try again)";
  else if (p.get("error")) msg = `Facebook connect cancelled: ${p.get("error_description") ?? p.get("error")}`;
  else {
    try { msg = `Facebook connected — ${await exchangeCode(p.get("code") ?? "", `${origin}/api/meta/callback`)} Page(s) found. Pick the Page to connect below.`; }
    catch (e) { msg = "Facebook connect failed: " + (e as Error).message; }
  }
  await setSetting("meta_last_op", `${new Date().toLocaleString("en-IN")} — ${msg}`);
  await audit(u.id, "meta_connect", "settings", "meta", { msg });
  return Response.redirect(`${origin}/settings?tab=integrations`, 302);
}
