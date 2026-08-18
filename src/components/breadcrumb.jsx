"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { ACCOUNT_NAV_SECTIONS, ERP_NAV_SECTIONS } from "@/lib/nav-sections";
import { cn } from "@/lib/utils";

// Flattens ERP_NAV_SECTIONS/ACCOUNT_NAV_SECTIONS once into { href -> {label,
// parentLabel} }, longest-href-first so a prefix match (e.g. "parties" vs
// "parties/groups") never shadows a more specific one — same ordering
// concern app-shell.jsx's bestActiveChildHref already solves for the
// sidebar's active state, mirrored here for the same reason.
function flattenSections(sections) {
  const entries = [];
  for (const section of sections) {
    for (const item of section.items) {
      if (item.children) {
        for (const child of item.children) {
          entries.push({ href: child.href, label: child.label, parentLabel: item.label });
        }
      } else {
        entries.push({ href: item.href, label: item.label, parentLabel: null });
      }
    }
  }
  return entries.sort((a, b) => b.href.length - a.href.length);
}

const ERP_ENTRIES = flattenSections(ERP_NAV_SECTIONS);
const ACCOUNT_ENTRIES = flattenSections(ACCOUNT_NAV_SECTIONS);

/**
 * "Section / Page" derived from the current URL against the same nav data
 * the sidebar renders from (see lib/nav-sections.js) — never a second,
 * independently-maintained route map. One extra trailing crumb is added for
 * a `/new` create route or a trailing numeric id (`#123`); anything deeper/
 * less certain than that is left off rather than guessed (redesign.md:
 * "do not show meaningless breadcrumbs everywhere"). Omitted entirely on the
 * dashboard itself — there's nothing to disambiguate there.
 */
export function Breadcrumb({ companySlug, mode = "erp" }) {
  const { t } = useTranslation();
  const pathname = usePathname();

  const prefix = `/${companySlug}/`;
  if (!pathname.startsWith(prefix)) return null;
  const relative = pathname.slice(prefix.length);
  const segments = relative.split("/").filter(Boolean);
  if (segments.length === 0 || relative === "dashboard") return null;

  const entries = mode === "account" ? ACCOUNT_ENTRIES : ERP_ENTRIES;
  const match = entries.find((entry) => relative === entry.href || relative.startsWith(`${entry.href}/`));
  if (!match) return null;

  const rest = relative.slice(match.href.length).split("/").filter(Boolean);
  let trailingLabel = null;
  if (rest[0] === "new") {
    trailingLabel = t("newLabel");
  } else if (rest[0] && /^\d+$/.test(rest[0])) {
    trailingLabel = `#${rest[0]}`;
  }

  const crumbs = [
    ...(match.parentLabel ? [{ label: t(match.parentLabel), href: null }] : []),
    { label: t(match.label), href: trailingLabel ? `/${companySlug}/${match.href}` : null },
    ...(trailingLabel ? [{ label: trailingLabel, href: null }] : []),
  ];

  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground md:flex">
      {crumbs.map((crumb, index) => (
        <span key={index} className="flex min-w-0 items-center gap-1">
          {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />}
          {crumb.href ? (
            <Link href={crumb.href} className="truncate transition-colors hover:text-foreground">
              {crumb.label}
            </Link>
          ) : (
            <span className={cn("truncate", index === crumbs.length - 1 && "font-medium text-foreground")}>
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
