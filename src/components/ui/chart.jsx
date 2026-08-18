"use client";

import * as React from "react";
import { ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "@/lib/utils";

// Minimal shadcn-style chart wrapper, trimmed to what this ERP actually
// needs (one recharts consumer today: the dashboard's sales/purchase trend —
// see redesign.md's CHART RULES: muted grid, restrained palette, no 3D/
// rainbow/donut). `config` is { [dataKey]: { label, color } } — color is
// written as a CSS variable on the wrapper div so recharts' `fill`/`stroke`
// props can reference `var(--color-<key>)` and stay themeable (light/dark)
// without recomputing hex values in JS.
export function ChartContainer({ config, className, children, ...props }) {
  const style = Object.fromEntries(Object.entries(config ?? {}).map(([key, value]) => [`--color-${key}`, value.color]));
  return (
    <div data-slot="chart" className={cn("h-full w-full text-xs", className)} style={style} {...props}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export const ChartTooltip = Tooltip;

export function ChartTooltipContent({ active, payload, label, config, formatter, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      {label != null && <p className="mb-1.5 font-medium">{labelFormatter ? labelFormatter(label) : label}</p>}
      <div className="space-y-1">
        {payload.map((entry) => {
          const entryConfig = config?.[entry.dataKey];
          return (
            <div key={entry.dataKey} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: entry.color }} />
                {entryConfig?.label ?? entry.dataKey}
              </span>
              <span className="font-medium tabular-nums">{formatter ? formatter(entry.value) : entry.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartLegend({ config }) {
  if (!config) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {Object.entries(config).map(([key, value]) => (
        <span key={key} className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: value.color }} />
          {value.label}
        </span>
      ))}
    </div>
  );
}
