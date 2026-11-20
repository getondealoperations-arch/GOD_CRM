import Link from "next/link";
import { can, requireUser, ROLE_LABEL, type Perm } from "@/lib/auth";
import { one } from "@/lib/db";
import { logout } from "./actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavLinks } from "@/components/nav-links";

const NAV: { href: string; label: string; perm?: Perm }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/calling", label: "Calling Workspace", perm: "calls.log" },
  { href: "/followups", label: "Follow-ups" },
  { href: "/campaigns", label: "Campaigns", perm: "reports.view" },
  { href: "/sales", label: "Sales & Payments" },
  { href: "/reports", label: "Reports & MIS", perm: "reports.view" },
  { href: "/team", label: "Team", perm: "reports.view" },
  { href: "/jobs", label: "Background Jobs" },
  { href: "/audit", label: "Audit Log", perm: "audit.view" },
  { href: "/settings", label: "Settings", perm: "settings.manage" },
];

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const u = await requireUser();
  const unread = (await one("SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_at IS NULL", [u.id]))!.c;
  const nav = NAV.filter((n) => !n.perm || can(u, n.perm));

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-surface md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 py-3 md:block">
          <Link href="/" className="font-bold text-indigo-700">GetOnDeal CRM</Link>
          <div className="text-xs text-slate-500 md:mt-1">{u.name} · {ROLE_LABEL[u.role]}</div>
        </div>
        <NavLinks items={nav} />
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-surface/90 px-4 py-2 backdrop-blur">
          <form action="/leads" className="flex-1">
            <input name="q" placeholder="Search name, mobile, business, Lead ID, campaign…" className="input max-w-lg" aria-label="Global search" />
          </form>
          <Link href="/notifications" className="btn-ghost relative" aria-label={`Notifications (${unread} unread)`}>
            🔔{unread > 0 && <span className="badge absolute -top-1.5 -right-1.5 bg-red-600 text-white">{unread}</span>}
          </Link>
          <ThemeToggle />
          <form action={logout}><button className="btn-ghost">Logout</button></form>
        </header>
        <main className="space-y-4 p-4">{children}</main>
      </div>
    </div>
  );
}
