import { can, currentUser } from "@/lib/auth";
import { importRows } from "@/lib/importer";
import { enqueue, saveUpload } from "@/lib/jobs";
import { parseSheet } from "@/lib/sheet";

const guess = (h: string) => {
  const k = h.toLowerCase().replace(/[^a-z]/g, "");
  const map: Record<string, string> = {
    name: "name", customername: "name", fullname: "name", mobile: "mobile", phone: "mobile", phonenumber: "mobile", mobilenumber: "mobile",
    altmobile: "alt_mobile", alternatemobile: "alt_mobile", email: "email", emailid: "email", businessname: "business_name", company: "business_name",
    category: "category", city: "city", location: "city", source: "source", leadsource: "source", channel: "channel", campaign: "campaign",
    campaignname: "campaign", adset: "adset_name", adsetname: "adset_name", ad: "ad_name", adname: "ad_name", form: "form_name", formname: "form_name",
    priority: "priority", owner: "owner_email", owneremail: "owner_email", assignedto: "owner_email", remarks: "remarks", notes: "remarks",
    tags: "tags", createdat: "created_at", date: "created_at", leaddate: "created_at",
  };
  return map[k] ?? "";
};

/**
 * POST multipart: file, mode=preview|validate|import, mapping (JSON {header: field}), duplicates=skip|update|allow.
 * preview/validate answer immediately; import is queued as a background job (src/lib/jobs.ts).
 */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u || !can(u, "lead.import")) return Response.json({ error: "Not permitted" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
  let sheet;
  try { sheet = await parseSheet(file); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  const mode = String(form.get("mode") ?? "preview");

  if (mode === "preview")
    return Response.json({ headers: sheet.headers, sample: sheet.rows.slice(0, 5), total: sheet.rows.length,
      mapping: Object.fromEntries(sheet.headers.map((h) => [h, guess(h)])) });

  const mapping = JSON.parse(String(form.get("mapping") ?? "{}")) as Record<string, string>;
  const dupMode = String(form.get("duplicates") ?? "skip");
  if (!Object.values(mapping).includes("name") || !Object.values(mapping).includes("mobile"))
    return Response.json({ error: "Map at least the Name and Mobile columns" }, { status: 400 });

  if (mode === "validate")
    return Response.json(await importRows({ rows: sheet.rows, mapping, dupMode, mode: "validate", userId: u.id, fileName: file.name }));

  // the actual import runs as a background job; the page polls /api/jobs/:id for progress and the result
  const jobId = await enqueue("import", { file: await saveUpload(file), fileName: file.name, mapping, dupMode }, u.id, sheet.rows.length);
  return Response.json({ jobId });
}
