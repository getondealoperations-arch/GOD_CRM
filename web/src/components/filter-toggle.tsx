"use client";
import { useState, type ReactNode } from "react";

/** Phones: filters sit behind a button so the data is the first thing on screen. md and up: always shown. */
export function FilterToggle({ active, children }: { active: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" className="btn-ghost mb-2 md:hidden" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide filters" : active ? `Filters (${active} applied)` : "Filters"}
      </button>
      <div className={open ? "" : "max-md:hidden"}>{children}</div>
    </div>
  );
}
