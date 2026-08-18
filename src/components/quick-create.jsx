"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { QUICK_CREATE_ITEMS } from "@/lib/quick-create-items";
import { cn } from "@/lib/utils";

/**
 * Topbar "+ Create" entry point (redesign.md's "QUICK CREATE" section) —
 * same permission/module gating as the sidebar and command palette, sharing
 * QUICK_CREATE_ITEMS with command-menu.jsx so the two never list different
 * things. Hidden entirely when the user has none of the gated modules
 * (Settings-only orgs, etc.) rather than rendering an empty "Create" button.
 */
export function QuickCreate({ companySlug, accessibleModules = [], className }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const items = QUICK_CREATE_ITEMS.filter((item) => !item.moduleKey || accessibleModules.includes(item.moduleKey));

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-full bg-linear-to-r from-[#F7B500] to-[#FFC928] px-3 text-sm font-medium text-primary-foreground transition-[filter] hover:brightness-95",
          className
        )}
      >
        <Plus className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">{t("quickCreate")}</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150">
          {items.map((item) => (
            <Link
              key={item.key}
              href={`/${companySlug}/${item.href}`}
              onClick={() => setOpen(false)}
              className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors hover:bg-muted"
            >
              <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              {t(item.labelKey)}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
