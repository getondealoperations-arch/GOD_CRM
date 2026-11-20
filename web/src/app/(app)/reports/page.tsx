import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { filterQuery, str, type SP } from "@/lib/filters";
import { REPORTS, withRange } from "@/lib/reports";
import { FilterBar } from "@/components/filter-bar";
import { ReportTable } from "@/components/report-table";

export default async function Reports({ searchParams }: PageProps<"/reports">) {
  const u = await requireUser("reports.view");
  const raw = (await searchParams) as SP;
  const name = str(raw.report) in REPORTS ? str(raw.report) : "lead_generation";
  const sp = withRange(raw);
  const report = await REPORTS[name].run(u, sp);
  const exp = (format: string) => `/api/export?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, str(v)])), report: name, format })}`;

  return (
    <>
      <h1 className="h1">Reports & MIS</h1>
      <nav className="flex flex-wrap gap-1">
        {Object.entries(REPORTS).map(([k, r]) => (
          <Link key={k} href={`?${filterQuery(sp, { report: k })}`} className={k === name ? "btn" : "btn-ghost"}>{r.title}</Link>
        ))}
      </nav>
      <FilterBar sp={sp} fields={["date", "campaign", "source", "category", "city", "team", "owner"]} keep={["report", "group", "level"]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{report.title}</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          {name === "lead_generation" && ["day", "week", "month"].map((g) => (
            <Link key={g} href={`?${filterQuery(sp, { report: name, group: g })}`} className={(str(sp.group) || "day") === g ? "font-semibold" : "link"}>{g}</Link>
          ))}
          {(name === "calls" || name === "forecast") && (name === "calls" ? ["agent", "hour", "disposition"] : ["stage", "source", "owner", "category"]).map((g, i) => (
            <Link key={g} href={`?${filterQuery(sp, { report: name, group: g })}`} className={(str(sp.group) || (i === 0 ? g : "")) === g ? "font-semibold" : "link"}>by {g}</Link>
          ))}
          {name === "adset" && ["adset", "ad"].map((g) => (
            <Link key={g} href={`?${filterQuery(sp, { report: name, level: g })}`} className={(str(sp.level) || "adset") === g ? "font-semibold" : "link"}>{g === "ad" ? "by ad" : "by ad set"}</Link>
          ))}
          <a className="btn-ghost" href={exp("csv")}>Export CSV</a>
          <a className="btn-ghost" href={exp("xlsx")}>Export Excel</a>
        </div>
      </div>
      <ReportTable report={report} sp={sp} />
      <p className="text-xs text-slate-500">
        Click the first column to drill down to the underlying leads (respecting your permissions). Leads are counted by creation date;
        sales, payments and spend by their own dates. Each sale is credited to one campaign (first or last touch — Settings → General). ROI = (gross profit − spend) ÷ spend.
      </p>
    </>
  );
}
