import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { listJobs } from "@/lib/jobs";
import { str, type SP } from "@/lib/filters";
import { fmtDate } from "@/components/ui";

/** Background jobs: bulk imports and large exports (SRS §18). Users see their own; admins see all. */
export default async function Jobs({ searchParams }: PageProps<"/jobs">) {
  const u = await requireUser();
  const started = str(((await searchParams) as SP).started);
  const all = can(u, "settings.manage");
  const jobs = await listJobs(all ? null : u.id);
  const busy = jobs.some((j) => j.status === "queued" || j.status === "running");
  return (
    <>
      {busy && <meta httpEquiv="refresh" content="3" />}
      <h1 className="h1">Background jobs</h1>
      {started && <p className="rounded bg-indigo-50 p-2 text-sm text-indigo-700">Job #{started} started. This page refreshes until it finishes; you can keep working meanwhile.</p>}
      <section className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>#</th><th>Type</th>{all && <th>By</th>}<th>Status</th><th>Progress</th><th>Started</th><th>Finished</th><th>Result</th></tr></thead>
          <tbody>{jobs.map((j) => {
            const r = j.result ? JSON.parse(j.result) : null;
            return (
              <tr key={j.id}>
                <td>{j.id}</td><td>{j.type === "import" ? "Lead import" : j.type === "export_leads" ? "Lead export" : j.type}</td>{all && <td>{j.user}</td>}
                <td className={j.status === "failed" ? "text-red-600" : j.status === "done" ? "text-green-700" : ""}>{j.status}</td>
                <td><progress value={j.progress} max={Math.max(1, j.total)} className="w-24" /> <span className="text-xs">{j.progress}/{j.total}</span></td>
                <td className="whitespace-nowrap">{fmtDate(j.created_at)}</td><td className="whitespace-nowrap">{fmtDate(j.finished_at)}</td>
                <td className="text-sm">
                  {j.error && <span className="text-red-600">{j.error}</span>}
                  {r && j.type === "import" && <>New {r.success} · Updated {r.updated} · Skipped {r.skipped} · Failed {r.failed}{" "}
                    {r.failedRows?.length > 0 && <a className="link" href={`/api/jobs/${j.id}/failed`}>failed rows CSV</a>}</>}
                  {j.file_path && j.status === "done" && <a className="link" href={`/api/jobs/${j.id}/download`}>Download ({r?.rows ?? 0} rows)</a>}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
        {!jobs.length && <p className="p-4 text-sm text-slate-500">No jobs yet. Imports and large exports run here in the background.</p>}
      </section>
    </>
  );
}
