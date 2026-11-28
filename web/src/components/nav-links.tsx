"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">{d}</svg>
);

// One icon per route; unknown routes fall back to a dot so a new nav item never breaks.
const ICONS: Record<string, ReactNode> = {
  "/": svg(<><rect x="3" y="3" width="6" height="7" rx="1.2" /><rect x="11" y="3" width="6" height="4" rx="1.2" /><rect x="3" y="12" width="6" height="5" rx="1.2" /><rect x="11" y="9" width="6" height="8" rx="1.2" /></>),
  "/leads": svg(<><circle cx="8" cy="7" r="3" /><path d="M2.5 17c.4-3 2.7-4.7 5.5-4.7s5.1 1.7 5.5 4.7" /><path d="M14.5 5.5a2.6 2.6 0 0 1 0 5M16.5 16.5c-.2-1.8-1-3-2.3-3.8" /></>),
  "/pipeline": svg(<path d="M3 4h14l-5 6v5l-4 2v-7z" />),
  "/calling": svg(<path d="M5.5 3h2.2l1.3 3.4-1.7 1.2a9 9 0 0 0 4.1 4.1l1.2-1.7L16 11.3v2.2A1.5 1.5 0 0 1 14.5 15C8.7 15 5 11.3 5 5.5 5 4.2 5.3 3 5.5 3z" />),
  "/followups": svg(<><circle cx="10" cy="10" r="7" /><path d="M10 6v4.2l2.8 1.6" /></>),
  "/campaigns": svg(<><path d="M3 8.5v3l9 4.5V4z" /><path d="M12 7.5c1.7.4 3 1.3 3 2.5s-1.3 2.1-3 2.5M5.5 12l1 4.5" /></>),
  "/sales": svg(<><path d="M5 3h10v14l-2.5-1.5L10 17l-2.5-1.5L5 17z" /><path d="M8 7.5h4M8 10.5h4" /></>),
  "/reports": svg(<><path d="M3.5 16.5h13" /><rect x="5" y="9" width="2.6" height="6" rx=".6" /><rect x="9" y="5" width="2.6" height="10" rx=".6" /><rect x="13" y="7.5" width="2.6" height="7.5" rx=".6" /></>),
  "/team": svg(<><circle cx="10" cy="7" r="3" /><path d="M4 17c.4-3.2 2.8-5 6-5s5.6 1.8 6 5" /></>),
  "/jobs": svg(<><rect x="3" y="4" width="14" height="4.5" rx="1.2" /><rect x="3" y="11.5" width="14" height="4.5" rx="1.2" /><path d="M6 6.3h.01M6 13.8h.01" /></>),
  "/audit": svg(<><path d="M10 2.8 16 5v4.6c0 3.6-2.5 6.2-6 7.6-3.5-1.4-6-4-6-7.6V5z" /><path d="m7.5 10 1.8 1.8L12.8 8" /></>),
  "/settings": svg(<><circle cx="10" cy="10" r="2.4" /><path d="M10 2.8v2M10 15.2v2M2.8 10h2M15.2 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4" /></>),
};
const DOT = svg(<circle cx="10" cy="10" r="2" />);

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:px-3 md:pb-4">
      {items.map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${active
              ? "bg-white/10 font-medium text-white shadow-[inset_3px_0_0_var(--color-brand)]"
              : "text-[#a9b7d9] hover:bg-white/5 hover:text-white"}`}>
            {ICONS[n.href] ?? DOT}
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
