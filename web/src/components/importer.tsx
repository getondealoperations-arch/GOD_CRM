"use client";
import Link from "next/link";
import Papa from "papaparse";
import { useState } from "react";

const FIELDS: [string, string][] = [
  ["", "— ignore —"], ["name", "Customer name *"], ["mobile", "Mobile *"], ["alt_mobile", "Alternate mobile"], ["email", "Email"],
  ["business_name", "Business name"], ["category", "Category"], ["city", "City"], ["source", "Lead source"], ["channel", "Channel"],
  ["campaign", "Campaign name"], ["adset_name", "Ad set"], ["ad_name", "Ad"], ["form_name", "Form name"], ["priority", "Priority"],
  ["owner_email", "Owner email"], ["remarks", "Remarks"], ["tags", "Tags"], ["created_at", "Created date/time"],
];

type Preview = { headers: string[]; sample: Record<string, string>[]; total: number; mapping: Record<string, string> };
type Result = { total: number; success: number; updated: number; skipped: number; failed: number; failedRows: Record<string, string>[] };

export function Importer() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dups, setDups] = useState("skip");
  const [check, setCheck] = useState<Result | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);

  /** Imports run as a background job; poll it until it finishes. Leaving the page does not stop the import. */
  async function waitForJob(id: number) {
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      const j = await (await fetch(`/api/jobs/${id}`)).json();
      setProg({ done: j.progress, total: j.total });
      if (j.status === "done") return j.result as Result;
      if (j.status === "failed") throw new Error(j.error ?? "Import failed");
    }
  }

  async function call(mode: string) {
    if (!file) return;
    setBusy(mode); setError("");
    const fd = new FormData();
    fd.set("file", file); fd.set("mode", mode); fd.set("mapping", JSON.stringify(mapping)); fd.set("duplicates", dups);
    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import failed");
      if (mode === "preview") { setPreview(json); setMapping(json.mapping); setCheck(null); setResult(null); }
      if (mode === "validate") setCheck(json);
      if (mode === "import") { setProg({ done: 0, total: preview?.total ?? 0 }); setResult(await waitForJob(json.jobId)); setProg(null); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }

  function downloadFailed(rows: Record<string, string>[]) {
    const blob = new Blob(["﻿" + Papa.unparse(rows)], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "failed-rows.csv" });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const summary = (r: Result, label: string) => (
    <div className="card space-y-2">
      <h2 className="h2">{label}</h2>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
        <div>Rows: <b>{r.total}</b></div><div className="text-green-700">New: <b>{r.success}</b></div>
        <div className="text-indigo-700">{label.startsWith("Validation") ? "Duplicates to update" : "Updated"}: <b>{r.updated}</b></div>
        <div className="text-amber-700">Skipped (duplicates): <b>{r.skipped}</b></div><div className="text-red-700">Failed: <b>{r.failed}</b></div>
      </div>
      {r.failedRows.length > 0 && <>
        <button className="btn-ghost" onClick={() => downloadFailed(r.failedRows)}>Download skipped/failed rows with reasons</button>
        <div className="max-h-48 overflow-auto text-xs">
          {r.failedRows.slice(0, 20).map((f, i) => <div key={i}>Row {f.row}: {f.error}</div>)}
        </div>
      </>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="file">1. Choose an Excel (.xlsx) or CSV file</label>
            <input id="file" type="file" accept=".csv,.xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }}
              className="text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-slate-300 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-50" />
          </div>
          <button className="btn disabled:cursor-not-allowed" disabled={!file || !!busy} title={file ? "" : "Choose a file first"} onClick={() => call("preview")}>
            {busy === "preview" ? "Reading…" : "2. Upload & preview"}
          </button>
          {!file && <span className="text-sm text-slate-500">Choose a file first. This button switches on once you have.</span>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
        <p className="text-xs text-slate-500">The first row of the file must be the column headings. Nothing is saved until you check the column mapping, validate and click Import.</p>
      </div>

      {preview && !result && (
        <div className="card space-y-3">
          <h2 className="h2">1. Map columns ({preview.total} rows found)</h2>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>File column</th><th>CRM field</th><th>Sample values</th></tr></thead>
              <tbody>{preview.headers.map((h) => (
                <tr key={h}>
                  <td className="font-medium">{h}</td>
                  <td><select className="input" value={mapping[h] ?? ""} aria-label={`Map ${h}`} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}>
                    {FIELDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                  <td className="text-xs text-slate-500">{preview.sample.map((s) => s[h]).filter(Boolean).slice(0, 3).join(" · ")}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <h2 className="h2">2. Duplicate handling (matched by mobile{" / "}email per settings)</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            {[["skip", "Skip duplicates"], ["update", "Update existing lead"], ["allow", "Import anyway"]].map(([v, l]) => (
              <label key={v} className="flex items-center gap-1"><input type="radio" name="dups" checked={dups === v} onChange={() => setDups(v)} />{l}</label>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={!!busy} onClick={() => call("validate")}>{busy === "validate" ? "Validating…" : "3. Validate"}</button>
            <button className="btn" disabled={!!busy || !check} onClick={() => call("import")} title={check ? "" : "Validate first"}>
              {busy === "import" ? "Importing…" : "4. Import"}
            </button>
          </div>
          {prog && (
            <div className="space-y-1 text-sm" aria-live="polite">
              <progress className="w-full" value={prog.done} max={Math.max(1, prog.total)} />
              <div>Importing in the background: {prog.done} / {prog.total} rows. You can leave this page; the result also appears under <Link className="link" href="/jobs">Jobs</Link>.</div>
            </div>
          )}
        </div>
      )}
      {check && !result && summary(check, "Validation (nothing saved yet)")}
      {result && <>{summary(result, "Import complete")}<Link className="link" href="/leads?source=Import">View imported leads →</Link></>}
    </div>
  );
}
