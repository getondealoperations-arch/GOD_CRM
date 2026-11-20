import ExcelJS from "exceljs";
import Papa from "papaparse";

export type Column = { key: string; label: string };

export async function parseSheet(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const res = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
    return { headers: res.meta.fields ?? [], rows: res.data };
  }
  if (!name.endsWith(".xlsx")) throw new Error("Upload a .csv or .xlsx file");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Workbook has no sheets");
  const cell = (v: ExcelJS.CellValue): string => {
    if (v == null) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 19).replace("T", " ");
    if (typeof v === "object") {
      if ("text" in v) return String(v.text);
      if ("result" in v) return String(v.result ?? "");
      if ("richText" in v) return v.richText.map((r) => r.text).join("");
    }
    return String(v);
  };
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (headers[i - 1] = cell(c.value).trim()));
  const rows: Record<string, string>[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const o: Record<string, string> = {};
    let any = false;
    headers.forEach((h, i) => { const v = cell(row.getCell(i + 1).value).trim(); o[h] = v; if (v) any = true; });
    if (any) rows.push(o);
  }
  return { headers, rows };
}

export function toCsv(cols: Column[], rows: Record<string, unknown>[]) {
  return "﻿" + Papa.unparse({ fields: cols.map((c) => c.label), data: rows.map((r) => cols.map((c) => r[c.key] ?? "")) });
}

export async function toXlsx(cols: Column[], rows: Record<string, unknown>[], sheet = "Export") {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.columns = cols.map((c) => ({ header: c.label, key: c.key, width: Math.min(40, Math.max(12, c.label.length + 2)) }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(Object.fromEntries(cols.map((c) => [c.key, r[c.key] ?? ""])));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function fileResponse(format: string, name: string, cols: Column[], rows: Record<string, unknown>[]) {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "xlsx")
    return new Response(new Uint8Array(await toXlsx(cols, rows)), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${name}-${stamp}.xlsx"`,
      },
    });
  return new Response(toCsv(cols, rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}-${stamp}.csv"` },
  });
}
