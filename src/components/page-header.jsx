import { cn } from "@/lib/utils";

// Server-safe (no "use client") — `action` is any ReactNode the caller
// builds, typically a plain `<Link className={buttonVariants(...)}>` from a
// Server Component page.js so a static "create" link needs no client JS at
// all. This is the ONE place a list/detail page's primary action lives —
// see redesign2.md's "REMOVE DUPLICATE PRIMARY ACTIONS": a page should not
// also repeat the same action inside its table's empty state once a
// PageHeader action already covers it.
//
// `stats` is optional and must be real, already-computed values — never
// pass fabricated counts. Omit it entirely for pages with nothing
// meaningful to summarize.
export function PageHeader({ title, description, action, stats, className }) {
  return (
    <div className={cn("mb-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {stats && stats.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 pt-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold tabular-nums text-foreground">{stat.value}</span>
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
