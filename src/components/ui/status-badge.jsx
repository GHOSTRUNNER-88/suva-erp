import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// One shared semantic vocabulary for every document status across Sales/
// Purchase/Finance (see db/schema/organization.js's mysqlEnum("status", ...)
// columns — this map's keys are the union of every status value used
// anywhere in the schema, not a per-module invention). Never color alone:
// every tone pairs with the translated label text itself, see redesign.md's
// "STATUS BADGES" rule.
const TONE = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-warning-soft text-warning",
  partial: "bg-warning-soft text-warning",
  ordered: "bg-info-soft text-info",
  sent: "bg-info-soft text-info",
  confirmed: "bg-info-soft text-info",
  accepted: "bg-success-soft text-success",
  received: "bg-success-soft text-success",
  delivered: "bg-success-soft text-success",
  completed: "bg-success-soft text-success",
  paid: "bg-success-soft text-success",
  approved: "bg-success-soft text-success",
  cleared: "bg-success-soft text-success",
  active: "bg-success-soft text-success",
  converted: "bg-success-soft text-success",
  expired: "bg-warning-soft text-warning",
  inactive: "bg-muted text-muted-foreground",
  overdue: "bg-destructive/10 text-destructive",
  bounced: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground line-through decoration-1",
};

/**
 * <StatusBadge status="completed" /> — status is the raw DB enum value
 * (lowercase, e.g. salesInvoices.status), translated via the shared
 * i18n keys of the same name (see i18n-resources.js's "Status badges"
 * section). Falls back to the raw value + neutral tone for anything not in
 * TONE, so an unmapped/future enum value never crashes, just looks plain.
 */
export function StatusBadge({ status, className }) {
  const { t } = useTranslation();
  if (!status) return null;
  const key = String(status).toLowerCase();
  const tone = TONE[key] ?? "bg-muted text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex h-5.5 items-center rounded-md px-2 text-[11px] font-medium whitespace-nowrap",
        tone,
        className
      )}
    >
      {t(key, { defaultValue: status })}
    </span>
  );
}
