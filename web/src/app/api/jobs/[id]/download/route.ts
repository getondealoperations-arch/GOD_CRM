import { readFile } from "node:fs/promises";
import path from "node:path";
import { can, currentUser } from "@/lib/auth";
import { audit, one } from "@/lib/db";
import { STORAGE } from "@/lib/jobs";

export async function GET(_: Request, ctx: RouteContext<"/api/jobs/[id]/download">) {
  const u = await currentUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const j = await one("SELECT id, file_path, created_by FROM jobs WHERE id=? AND status='done'", [Number((await ctx.params).id)]);
  if (!j?.file_path || (j.created_by !== u.id && !can(u, "settings.manage"))) return new Response("Not found", { status: 404 });
  const file = path.resolve(j.file_path);
  if (!file.startsWith(path.resolve(STORAGE) + path.sep)) return new Response("Not found", { status: 404 });
  await audit(u.id, "download", "job", j.id);
  const xlsx = file.endsWith(".xlsx");
  return new Response(new Uint8Array(await readFile(file)), { headers: {
    "content-type": xlsx ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${path.basename(file)}"`,
  } });
}
