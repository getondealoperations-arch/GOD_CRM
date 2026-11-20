import { readFile } from "node:fs/promises";
import path from "node:path";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/db";
import { BACKUP_DIR } from "@/lib/backup";

/** A full database dump contains everyone's data: Super Admin only, and every download is audited. */
export async function GET(_: Request, ctx: RouteContext<"/api/backups/[name]">) {
  const u = await currentUser();
  if (!u || u.role !== "super_admin") return new Response("Forbidden", { status: 403 });
  const name = path.basename(decodeURIComponent((await ctx.params).name));
  if (!/^getondeal-\d+\.sql\.gz$/.test(name)) return new Response("Not found", { status: 404 });
  try {
    const buf = await readFile(path.join(BACKUP_DIR, name));
    await audit(u.id, "download", "backup", name);
    return new Response(new Uint8Array(buf), { headers: { "content-type": "application/gzip", "content-disposition": `attachment; filename="${name}"` } });
  } catch { return new Response("Not found", { status: 404 }); }
}
