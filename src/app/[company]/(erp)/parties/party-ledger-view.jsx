"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Download, Loader2, Pencil, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportPartyLedgerToExcel } from "@/lib/export-excel";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";

// Both table instances (on-screen + print) share one column template so
// header and body cells always line up — using `auto` tracks independently
// per row div (as this used to) sizes each row's columns off that row's own
// content instead of the shared header, which is what caused Dr/Cr/Balance
// to drift out of alignment with their header labels.
const LEDGER_GRID = "grid grid-cols-[1fr_130px_130px_170px] gap-3";

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-CA").format(new Date(value));
}

/**
 * Party header + ledger table — shared by the standalone route
 * (parties/[party]/page.js) and the group split view's right panel
 * (parties/groups/party-groups-view.jsx), so both stay in sync for free.
 * See actions.js's getPartyLedger() for why `entries` is just the opening
 * balance line today — real transaction rows append here once
 * sales/purchase/payment modules exist, not before.
 *
 * `organization` ({ name, logoUrl }) is only used by the print letterhead —
 * pass whatever the page's getAuthenticatedAppContext() call already
 * returned as `activeOrganization`, no extra fetch needed.
 */
export function PartyLedgerView({ party, entries, organization, onEdit, compact = false }) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const currentBalance = Number(party.balance);
  const isCredit = currentBalance < 0;

  async function handleExportExcel() {
    setExporting(true);
    try {
      await exportPartyLedgerToExcel({
        organizationName: organization?.name,
        party,
        entries,
        filename: `${party.name.replace(/[^a-z0-9]+/gi, "-")}-ledger.xlsx`,
        labels: {
          sheetName: t("ledger").slice(0, 31),
          statementTitle: t("statementOfAccount"),
          description: t("description"),
          dr: t("Dr"),
          cr: t("Cr"),
          balance: t("balance"),
          entryLabel: (entry) => t(entry.label),
          formatDate,
        },
      });
    } catch {
      notify.error(t("somethingWentWrong"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        <Button type="button" size="sm" variant="outline" disabled={exporting} onClick={handleExportExcel}>
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {t("exportExcel")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" />
          {t("print")}
        </Button>
      </div>

      <div className="print:hidden">
        <div className="flex items-start justify-between gap-4 rounded-xl border bg-background p-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{party.name}</p>
            <p className="text-xs text-muted-foreground">{t(party.type)}</p>
            <dl className={cn("mt-3 grid gap-x-6 gap-y-1.5 text-sm", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
              <div className="flex justify-between gap-4 sm:justify-start">
                <dt className="text-muted-foreground">{t("phone")}</dt>
                <dd className="font-medium">{party.phoneNumber || t("notSet")}</dd>
              </div>
              <div className="flex justify-between gap-4 sm:justify-start">
                <dt className="text-muted-foreground">{t("panNumber")}</dt>
                <dd className="font-medium">{party.panNumber || t("notSet")}</dd>
              </div>
              <div className="flex justify-between gap-4 sm:justify-start">
                <dt className="text-muted-foreground">{t("partyGroup")}</dt>
                <dd className="font-medium">{party.partyGroupName || t("notSet")}</dd>
              </div>
              {party.address && (
                <div className="flex justify-between gap-4 sm:justify-start">
                  <dt className="text-muted-foreground">{t("organizationAddress")}</dt>
                  <dd className="truncate font-medium">{party.address}</dd>
                </div>
              )}
            </dl>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-muted-foreground">{t("balance")}</p>
            <p className={cn("text-xl font-semibold", isCredit ? "text-amber-700 dark:text-amber-500" : "text-foreground")}>
              NPR {formatAmount(Math.abs(currentBalance))}
            </p>
            <p className="text-xs text-muted-foreground">{isCredit ? t("Cr") : t("Dr")}</p>
            {onEdit && (
              <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" />
                {t("edit")}
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border bg-background">
          <div className={cn(LEDGER_GRID, "border-b bg-muted/60 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase")}>
            <span>{t("description")}</span>
            <span className="text-right">{t("Dr")}</span>
            <span className="text-right">{t("Cr")}</span>
            <span className="text-right">{t("balance")}</span>
          </div>
          {entries.map((entry) => (
            <div key={entry.key} className={cn(LEDGER_GRID, "border-b px-4 py-3 text-sm last:border-b-0")}>
              <div>
                <p className="font-medium">{t(entry.label)}</p>
                <p className="text-xs text-muted-foreground">{formatDate(entry.date)}</p>
              </div>
              <span className="text-right tabular-nums">{entry.debit ? formatAmount(entry.debit) : "—"}</span>
              <span className="text-right tabular-nums">{entry.credit ? formatAmount(entry.credit) : "—"}</span>
              <span className="text-right font-medium tabular-nums">
                {formatAmount(Math.abs(entry.runningBalance))} {entry.runningBalance < 0 ? t("Cr") : t("Dr")}
              </span>
            </div>
          ))}
          <p className="border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">{t("ledgerNoTransactionsYet")}</p>
        </div>
      </div>

      {/* Print-only letterhead + table — deliberately plain black-on-white
         (not the theme's bg-background/text-foreground tokens), since those
         resolve to near-white text in dark mode and would print invisible
         on paper regardless of which theme the screen happened to be in. */}
      <div className="hidden print:block">
        <div className="flex items-center justify-between border-b-2 border-gray-800 pb-3">
          <div className="flex items-center gap-3">
            {organization?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Firebase Storage URL, not a local/optimizable asset
              <img src={organization.logoUrl} alt="" className="h-12 w-12 rounded object-cover" />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded bg-gray-100">
                <Building2 className="h-6 w-6 text-gray-500" />
              </div>
            )}
            <div>
              <p className="text-lg font-bold text-gray-900">{organization?.name ?? ""}</p>
              <p className="text-xs text-gray-500">{t("statementOfAccount")}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            {t("generatedOn")}: {formatDate(new Date())}
          </p>
        </div>

        <div className="mt-4 mb-2">
          <p className="text-base font-semibold text-gray-900">{party.name}</p>
          <p className="text-xs text-gray-600">
            {t(party.type)}
            {party.phoneNumber ? ` • ${party.phoneNumber}` : ""}
            {party.panNumber ? ` • PAN ${party.panNumber}` : ""}
          </p>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-gray-800">
              <th className="py-2 text-left font-semibold text-gray-900">{t("description")}</th>
              <th className="py-2 text-right font-semibold text-gray-900">{t("Dr")}</th>
              <th className="py-2 text-right font-semibold text-gray-900">{t("Cr")}</th>
              <th className="py-2 text-right font-semibold text-gray-900">{t("balance")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.key} className="border-b border-gray-300">
                <td className="py-2 text-gray-900">
                  {t(entry.label)} <span className="text-xs text-gray-500">{formatDate(entry.date)}</span>
                </td>
                <td className="py-2 text-right text-gray-900">{entry.debit ? formatAmount(entry.debit) : "—"}</td>
                <td className="py-2 text-right text-gray-900">{entry.credit ? formatAmount(entry.credit) : "—"}</td>
                <td className="py-2 text-right font-medium text-gray-900">
                  {formatAmount(Math.abs(entry.runningBalance))} {entry.runningBalance < 0 ? t("Cr") : t("Dr")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex items-center justify-between border-t border-gray-300 pt-3 text-xs text-gray-500">
          <p>{t("poweredBySuvacorp")}</p>
          <p className="font-medium text-gray-700">
            {t("balance")}: NPR {formatAmount(Math.abs(currentBalance))} {isCredit ? t("Cr") : t("Dr")}
          </p>
        </div>
      </div>
    </div>
  );
}
