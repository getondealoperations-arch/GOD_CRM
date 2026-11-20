import { can, requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { NewLeadForm } from "@/components/new-lead-form";
import { getPriorities } from "@/lib/leads";

export default async function NewLead() {
  const u = await requireUser("lead.create");
  const [campaigns, users] = await Promise.all([
    q("SELECT id, name FROM campaigns WHERE status<>'completed' ORDER BY name"),
    can(u, "lead.assign") ? q("SELECT id, name FROM users WHERE active=1 AND role IN ('calling_executive','sales_executive','team_leader') ORDER BY name") : Promise.resolve([]),
  ]);
  const priorities = await getPriorities();
  return (
    <>
      <h1 className="h1">New lead</h1>
      <NewLeadForm campaigns={campaigns} users={users} canAssign={can(u, "lead.assign")} priorities={priorities} />
    </>
  );
}
