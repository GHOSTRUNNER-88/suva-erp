"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "+ Add details" disclosure — collapses secondary fields (billing
 * name/address, PAN, reference no, warehouse, bank account, etc.) behind a
 * single unobtrusive toggle so a document's create form leads with just the
 * party/date/lines, matching the minimal reference design (see the
 * "ADD DESCRIPTION / ADD IMAGE / ADD DOCUMENT" row in that screenshot —
 * same idea, generalized to whatever fields a given document needs).
 * Starts open when `defaultOpen` is true (e.g. editing a document that
 * already has one of these fields filled in, so nothing looks hidden).
 */
export function CollapsibleDetails({ label, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  if (open) {
    return (
      <div className="space-y-3 rounded-2xl border bg-background p-4">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          {label}
        </button>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        "flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground",
        "hover:border-solid hover:bg-muted/40 hover:text-foreground"
      )}
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
