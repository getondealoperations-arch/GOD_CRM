import { can, currentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { toCsv } from "@/lib/sheet";

/** Failed/skipped rows of an import job, with the reason, as CSV (SRS §6). */
export async function GET(_: Request, ctx: RouteContext<"/api/jobs/[id]/failed">) {
  const u = await currentUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const j = await one("SELECT result, created_by FROM jobs WHERE id=? AND type='import'", [Number((await ctx.params).id)]);
  if (!j?.result || (j.created_by !== u.id && !can(u, "settings.manage"))) return new Response("Not found", { status: 404 });
  const rows: Record<string, string>[] = JSON.parse(j.result).failedRows ?? [];
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return new Response(toCsv(keys.map((k) => ({ key: k, label: k })), rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="import-${(await ctx.params).id}-failed-rows.csv"` },
  });
}
