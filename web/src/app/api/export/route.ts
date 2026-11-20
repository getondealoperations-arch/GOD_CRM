import { can, currentUser } from "@/lib/auth";
import { audit, getSetting, one } from "@/lib/db";
import { LEAD_COLS, leadExportRows } from "@/lib/export";
import { leadWhere, str, type SP } from "@/lib/filters";
import { enqueue } from "@/lib/jobs";
import { REPORTS } from "@/lib/reports";
import { fileResponse } from "@/lib/sheet";

/** Above this many rows, lead exports run as a background job (Jobs page) instead of inside the request. */
const SYNC_LIMIT = 20000;

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams) as SP;
  const format = str(sp.format) === "xlsx" ? "xlsx" : "csv";

  if (str(sp.report)) {
    const r = REPORTS[str(sp.report)];
    if (!r || !can(u, "reports.view")) return new Response("Forbidden", { status: 403 });
    const rep = await r.run(u, sp);
    await audit(u.id, "export", "report", str(sp.report), { format, rows: rep.rows.length, filters: sp });
    return fileResponse(format, `report-${str(sp.report)}`, rep.columns, rep.rows);
  }

  if (!can(u, "lead.export")) return new Response("Forbidden: export not permitted for your role", { status: 403 });
  const masked = str(sp.mask) === "1" || ((await getSetting("mask_exports")) === "1" && u.role !== "super_admin");
  const w = leadWhere(u, sp);
  const count = Number((await one(`SELECT COUNT(*) c FROM leads l WHERE ${w.where}`, w.params))!.c);
  if (count > SYNC_LIMIT || str(sp.background) === "1") {
    const id = await enqueue("export_leads", { sp, format, masked }, u.id, count);
    await audit(u.id, "export", "lead", null, { format, rows: count, masked, filters: sp, job: id });
    return Response.redirect(new URL(`/jobs?started=${id}`, req.url), 303);
  }
  const rows = await leadExportRows(u, sp, masked);
  await audit(u.id, "export", "lead", null, { format, rows: rows.length, masked, filters: sp });
  return fileResponse(format, "leads", LEAD_COLS, rows);
}
