"use client";

import { cn } from "@/lib/utils";

/**
 * Pill-style option group for small fixed choice sets (2-4 options) — the
 * "smart default" form control from the design backlog: a real fixed
 * choice should read as a segmented control, not a bare native <select> or
 * a pair of ad-hoc buttons. Always pass a `value` that's already one of the
 * options — this renders selection state, it doesn't invent one.
 *
 * `wrap` is for larger sets (e.g. warehouse type's 5 options) where forcing
 * every pill into one equal-width row (the flex-1 default) would squeeze
 * longer labels unreadably — wrap sizes pills to their own content and lets
 * them flow onto a second row instead.
 */
export function SegmentedControl({ options, value, onChange, className = "", wrap = false }) {
  return (
    <div
      className={cn(
        wrap ? "flex flex-wrap gap-2 rounded-xl bg-muted/60 p-1" : "flex h-11 gap-2 rounded-xl bg-muted/60 p-1",
        className
      )}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-lg text-sm font-medium transition-colors",
            wrap ? "px-3.5 py-2" : "flex-1",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
