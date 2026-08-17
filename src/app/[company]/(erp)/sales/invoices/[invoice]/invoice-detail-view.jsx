"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Ban, Loader2, Pencil, Printer, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { InvoiceStatusBadge, formatAmount, formatDate } from "../sales-invoices-view";
import InvoiceForm from "../invoice-form";
import { cancelSalesInvoiceAction } from "../actions";

const LINE_GRID = "grid grid-cols-[1fr_90px_70px_110px_100px_120px] gap-3";

function DetailField({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

/**
 * Full invoice header + line items + Edit/Cancel/Print actions. Editing
 * inline-swaps to the shared ../invoice-form.jsx (mode="edit") rather than
 * a Sheet — matches purchase/bills' bill-detail-view.jsx pattern, needed
 * for the width the redesigned spreadsheet-style line-item table wants.
 */
export function InvoiceDetailView({ companySlug, invoice, lines, formData }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    if (!window.confirm(t("confirmCancelSalesInvoice", { number: invoice.invoiceNumber }))) return;
    setCancelling(true);
    const result = await cancelSalesInvoiceAction(companySlug, invoice.id);
    setCancelling(false);
    if (!result.ok) {
      notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
      return;
    }
    notify.success(t(result.message));
    router.refresh();
  }

  const bankLabel = invoice.bankName
    ? invoice.bankDisplayName
      ? `${invoice.bankName} — ${invoice.bankDisplayName}`
      : invoice.bankName
    : null;

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">{t("editSalesInvoice")}</h1>
          <Button type="button" variant="outline" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" />
            {t("cancel")}
          </Button>
        </div>
        <InvoiceForm companySlug={companySlug} mode="edit" invoice={invoice} initialLines={lines} formData={formData} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
              <Receipt className="h-6 w-6" />
            </span>
            <div>
              <p className="text-lg font-semibold">{invoice.invoiceNumber}</p>
              <p className="text-sm text-muted-foreground">
                {invoice.partyName}
                {invoice.partyPhone ? ` · ${invoice.partyPhone}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <InvoiceStatusBadge status={invoice.status} />
            <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" />
              {t("print")}
            </Button>
            {invoice.status !== "cancelled" && (
              <>
                <Button type="button" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                  {t("edit")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={cancelling}
                  onClick={handleCancel}
                >
                  {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                  {t("cancel")}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailField label={t("invoiceDate")} value={formatDate(invoice.invoiceDate)} />
          <DetailField label={t("warehouse")} value={invoice.warehouseName} />
          <DetailField label={t("billingName")} value={invoice.billingName} />
          <DetailField label={t("panNumber")} value={invoice.panNumber} />
          <DetailField label={t("billingAddress")} value={invoice.billingAddress} />
          {invoice.isReceived === 1 && bankLabel && <DetailField label={t("bankAccount")} value={bankLabel} />}
          {invoice.notes && <DetailField label={t("notes")} value={invoice.notes} />}
        </div>
      </div>

      <div className="rounded-xl border bg-background">
        <div className="border-b p-4">
          <h2 className="text-sm font-semibold">{t("lineItems")}</h2>
        </div>
        <div className="overflow-x-auto">
          <div className={cn(LINE_GRID, "min-w-175 border-b bg-muted/60 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase")}>
            <span>{t("item")}</span>
            <span className="text-right">{t("quantity")}</span>
            <span>{t("unit")}</span>
            <span className="text-right">{t("rate")}</span>
            <span className="text-right">{t("discount")}</span>
            <span className="text-right">{t("lineTotal")}</span>
          </div>
          {lines.map((line) => (
            <div key={line.id} className={cn(LINE_GRID, "min-w-175 items-center border-b px-4 py-3 text-sm last:border-b-0")}>
              <span className="min-w-0 truncate">
                {line.itemName}
                {line.variantName && <span className="text-muted-foreground"> · {line.variantName}</span>}
              </span>
              <span className="text-right tabular-nums">{formatAmount(line.quantity).replace(/\.00$/, "")}</span>
              <span className="text-xs text-muted-foreground">{line.unitCode}</span>
              <span className="text-right tabular-nums">{formatAmount(line.rate)}</span>
              <span className="text-right text-xs tabular-nums text-muted-foreground">
                {Number(line.discAmount) > 0 ? `− ${formatAmount(line.discAmount)}` : "—"}
              </span>
              <span className="text-right font-medium tabular-nums">{formatAmount(line.lineTotal)}</span>
            </div>
          ))}
        </div>

        <div className="ml-auto max-w-xs space-y-1.5 p-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>{t("subtotal")}</span>
            <span className="tabular-nums">NPR {formatAmount(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{t("discount")}</span>
            <span className="tabular-nums">− NPR {formatAmount(invoice.discAmount)}</span>
          </div>
          {invoice.isVatApplicable === 1 && (
            <div className="flex justify-between text-muted-foreground">
              <span>
                {t("vat")} ({formatAmount(invoice.vatPercent).replace(/\.00$/, "")}%)
              </span>
              <span className="tabular-nums">+ NPR {formatAmount(invoice.vatAmount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-1.5 text-base font-semibold">
            <span>{t("totalAmount")}</span>
            <span className="tabular-nums">NPR {formatAmount(invoice.totalAmount)}</span>
          </div>
          {invoice.status !== "cancelled" && (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>{t("receivedAmount")}</span>
                <span className="tabular-nums">NPR {formatAmount(invoice.receivedAmount)}</span>
              </div>
              <div className="flex justify-between font-medium text-amber-700 dark:text-amber-500">
                <span>{t("dueAmount")}</span>
                <span className="tabular-nums">NPR {formatAmount(invoice.dueAmount)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
