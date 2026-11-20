import { can, currentUser } from "@/lib/auth";
import { one } from "@/lib/db";

export async function GET(_: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const u = await currentUser();
  if (!u) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const j = await one("SELECT id, type, status, progress, total, result, error, created_by FROM jobs WHERE id=?", [Number((await ctx.params).id)]);
  if (!j || (j.created_by !== u.id && !can(u, "settings.manage"))) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ...j, result: j.result ? JSON.parse(j.result) : null });
}
