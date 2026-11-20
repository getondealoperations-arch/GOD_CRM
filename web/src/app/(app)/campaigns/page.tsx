import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { type SP } from "@/lib/filters";
import { inr, pct, ratio } from "@/lib/metrics";
import { aggregate, dateRange, withRange } from "@/lib/reports";
import { FilterBar } from "@/components/filter-bar";
import { num } from "@/components/ui";
import { CampaignForm } from "@/components/campaign-form";

export default async function Campaigns({ searchParams }: PageProps<"/campaigns">) {
  const u = await requireUser("reports.view");
  const sp = withRange((await searchParams) as SP);
  const { from, to } = dateRange(sp);
  const [campaigns, perf, users] = await Promise.all([
    q("SELECT c.*, ou.name owner FROM campaigns c LEFT JOIN users ou ON ou.id=c.owner_id ORDER BY c.status='active' DESC, c.created_at DESC"),
    aggregate(u, sp, "campaign"),
    q("SELECT id, name FROM users WHERE active=1 AND role IN ('marketing_manager','admin','super_admin','sales_manager') ORDER BY name"),
  ]);
  const byId = new Map(perf.map((p) => [p.key, p]));

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="h1">Campaigns</h1>
        <span className="text-sm text-slate-500">Performance {from} → {to}</span>
      </div>
      <FilterBar sp={sp} fields={["date", "source", "category", "city", "team"]} />

      <div className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead><tr>
            <th>Campaign</th><th>Channel</th><th>Status</th><th className="text-right">Budget</th><th className="text-right">Spend</th><th className="text-right">Leads</th>
            <th className="text-right">Qualified</th><th className="text-right">Conv.</th><th className="text-right">Revenue</th><th className="text-right">CPL</th>
            <th className="text-right">CAC</th><th className="text-right">ROAS</th><th className="text-right">ROI</th>
          </tr></thead>
          <tbody>
            {campaigns.map((c) => {
              const p = byId.get(String(c.id));
              return (
                <tr key={c.id}>
                  <td><Link className="link font-medium" href={`/campaigns/${c.id}`}>{c.name}</Link><div className="text-xs text-slate-400">{c.category} · {c.owner ?? "no owner"}{c.meta_campaign_id ? " · Meta" : ""}</div></td>
                  <td>{c.channel}</td><td>{c.status}</td>
                  <td className="text-right tabular-nums">{inr(c.budget)}</td>
                  <td className="text-right tabular-nums">{inr(p?.spend ?? 0)}</td>
                  <td className="text-right tabular-nums"><Link className="link" href={`/leads?campaign=${c.id}&from=${from}&to=${to}`}>{num(p?.leads ?? 0)}</Link></td>
                  <td className="text-right tabular-nums">{num(p?.qualified ?? 0)}</td>
                  <td className="text-right tabular-nums">{num(p?.converted ?? 0)} <span className="text-xs text-slate-400">{pct(p?.convRate ?? null)}</span></td>
                  <td className="text-right tabular-nums">{inr(p?.revenue ?? 0)}</td>
                  <td className="text-right tabular-nums">{inr(p?.cpl)}</td>
                  <td className="text-right tabular-nums">{inr(p?.cac)}</td>
                  <td className="text-right tabular-nums">{ratio(p?.roas ?? null)}</td>
                  <td className={`text-right tabular-nums ${p?.roi != null && p.roi < 0 ? "text-red-600" : ""}`}>{pct(p?.roi ?? null)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {can(u, "campaign.manage") && (
        <details className="card">
          <summary className="cursor-pointer font-medium text-indigo-700">+ New campaign</summary>
          <CampaignForm users={users} />
        </details>
      )}
    </>
  );
}
