"use client";

export function ThemeToggle() {
  return (
    <button type="button" className="btn-ghost" aria-label="Toggle dark mode" title="Toggle dark mode"
      onClick={() => {
        const dark = document.documentElement.classList.toggle("dark");
        document.cookie = `theme=${dark ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
      }}>
      <span className="dark:hidden">🌙</span><span className="hidden dark:inline">☀️</span>
    </button>
  );
}
