import { timingSafeEqual } from "node:crypto";
import { getSetting, logError } from "@/lib/db";
import { applyCallback } from "@/lib/telephony";

async function handle(req: Request) {
  const url = new URL(req.url);
  const want = await getSetting("tel_callback_token");
  const got = url.searchParams.get("token") ?? "";
  if (!want || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return new Response("Unauthorized", { status: 401 });
  let p: Record<string, string> = Object.fromEntries(url.searchParams);
  if (req.method === "POST") {
    const ct = req.headers.get("content-type") ?? "";
    const raw = await req.text();
    try { p = { ...p, ...(ct.includes("json") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw))) }; }
    catch (e) { await logError("telephony_callback", e, raw.slice(0, 500)); return new Response("Bad body", { status: 400 }); }
  }
  const ok = await applyCallback(p);
  if (!ok) await logError("telephony_callback", "Unknown CallSid", p);
  return new Response("OK");
}
export const GET = handle;
export const POST = handle;
