import { timingSafeEqual } from "node:crypto";
import { runAutomation } from "@/lib/automation";

/** For multi-instance deployments (AUTOMATION=off): call from one scheduler with `Authorization: Bearer $CRON_SECRET`. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret)))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await runAutomation());
}
