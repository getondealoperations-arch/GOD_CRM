import Image from "next/image";
import Link from "next/link";
import { can, FIELD_ROLES, requireUser, ROLE_LABEL, type Perm } from "@/lib/auth";
import { one } from "@/lib/db";
import { logout } from "./actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavLinks } from "@/components/nav-links";

const NAV: { href: string; label: string; perm?: Perm }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/work", label: "My work", perm: "calls.log" },
  { href: "/leads", label: "Leads" },
  { href: "/leads/distribute", label: "Split & assign", perm: "lead.assign" },
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
  // Front-line employees get a slim menu: their own work, leads, calls and follow-ups (plus pipeline and sales if they book sales).
  const slim = FIELD_ROLES.includes(u.role);
  const SLIM = ["/work", "/leads", "/calling", "/followups"];
  const nav = NAV.filter((n) => !n.perm || can(u, n.perm))
    .filter((n) => !slim || SLIM.includes(n.href) || (["/pipeline", "/sales"].includes(n.href) && can(u, "sales.manage")));
  const initials = u.name.split(/\s+/).map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* The sidebar is the logo's navy in light and dark mode alike: it is the product's anchor. */}
      <aside className="bg-ink md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col">
        <div className="flex items-center justify-between px-4 py-3 md:py-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="GetOnDeal home">
            {/* White tile: the logo's navy half would disappear on the navy sidebar. */}
            <span className="grid size-9 place-items-center rounded-lg bg-white p-1"><Image src="/logo.png" alt="" width={28} height={28} priority /></span>
            <span className="font-display text-lg font-semibold tracking-tight text-white">GetOnDeal</span>
          </Link>
          <span className="text-xs text-[#a9b7d9] md:hidden">{u.name}</span>
        </div>
        <div className="md:min-h-0 md:flex-1 md:overflow-y-auto"><NavLinks items={nav} /></div>
        <div className="hidden items-center gap-2.5 border-t border-white/10 px-4 py-3 md:flex">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white">{initials}</span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-white">{u.name}</div>
            <div className="truncate text-xs text-[#a9b7d9]">{ROLE_LABEL[u.role]}</div>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-surface/85 px-4 py-2.5 backdrop-blur">
          <form action="/leads" className="relative flex-1" role="search">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><circle cx="9" cy="9" r="5.5" /><path d="m13.5 13.5 3 3" /></svg>
            <input name="q" placeholder="Search name, mobile, business, Lead ID, campaign…" className="input max-w-lg pl-8" aria-label="Global search" />
          </form>
          <Link href="/notifications" className="btn-ghost relative px-2.5" aria-label={`Notifications (${unread} unread)`}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 8a5 5 0 0 1 10 0c0 4 1.5 5 1.5 5h-13S5 12 5 8zM8.5 16.5a1.6 1.6 0 0 0 3 0" /></svg>
            {unread > 0 && <span className="badge absolute -top-1.5 -right-1.5 bg-red-600 text-white">{unread}</span>}
          </Link>
          <ThemeToggle />
          <form action={logout}><button className="btn-ghost">Log out</button></form>
        </header>
        <main className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
