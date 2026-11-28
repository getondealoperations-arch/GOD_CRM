"use client";

const icon = { viewBox: "0 0 20 20", width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export function ThemeToggle() {
  return (
    <button type="button" className="btn-ghost px-2.5" aria-label="Toggle dark mode" title="Toggle dark mode"
      onClick={() => {
        const dark = document.documentElement.classList.toggle("dark");
        document.cookie = `theme=${dark ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
      }}>
      <svg {...icon} className="dark:hidden"><path d="M16.5 11.5A6.5 6.5 0 0 1 8.5 3.5a6.5 6.5 0 1 0 8 8z" /></svg>
      <svg {...icon} className="hidden dark:block"><circle cx="10" cy="10" r="3.2" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></svg>
    </button>
  );
}
