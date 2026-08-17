"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Ban, Eye, Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { cancelSalesInvoiceAction } from "./actions";

export function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-CA").format(new Date(value));
}

export function InvoiceStatusBadge({ status }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium",
        status === "cancelled"
          ? "bg-destructive/10 text-destructive"
          : status === "draft"
            ? "bg-muted text-muted-foreground"
            : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      )}
    >
      {t(status === "cancelled" ? "cancelled" : status === "draft" ? "draft" : "completed")}
    </span>
  );
}

/**
 * List shell for Sales Invoices — same page -> {Module}View -> DataTable
 * shape as every other module, routing to dedicated new/[invoice] pages
 * (see invoice-form.jsx's header comment for why this moved off a Sheet:
 * the redesigned spreadsheet-style line-item table needs the width a
 * narrow side panel can't give it).
 */
export default function SalesInvoicesView({ companySlug, initialInvoices }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [cancellingId, setCancellingId] = useState(null);
  const [, startCancelTransition] = useTransition();

  function openDetail(invoice) {
    router.push(`/${companySlug}/sales/invoices/${invoice.id}`);
  }

  function handleCancel(invoice) {
    if (!window.confirm(t("confirmCancelSalesInvoice", { number: invoice.invoiceNumber }))) return;
    setCancellingId(invoice.id);
    startCancelTransition(async () => {
      const result = await cancelSalesInvoiceAction(companySlug, invoice.id);
      setCancellingId(null);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t(result.message));
      router.refresh();
    });
  }

  const columns = [
    {
      key: "invoiceNumber",
      header: t("invoiceNumber"),
      sortable: true,
      render: (invoice) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <Receipt className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{invoice.invoiceNumber}</p>
            <p className="truncate text-xs text-muted-foreground">{invoice.partyName}</p>
          </div>
        </div>
      ),
    },
    {
      key: "invoiceDate",
      header: t("invoiceDate"),
      sortable: true,
      render: (invoice) => <span className="text-sm text-muted-foreground">{formatDate(invoice.invoiceDate)}</span>,
    },
    {
      key: "totalAmount",
      header: t("totalAmount"),
      sortable: true,
      className: "flex-none w-36 justify-end text-right",
      render: (invoice) => <span className="font-medium tabular-nums">NPR {formatAmount(invoice.totalAmount)}</span>,
    },
    {
      key: "dueAmount",
      header: t("dueAmount"),
      className: "flex-none w-32 justify-end text-right",
      render: (invoice) =>
        invoice.status === "cancelled" ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : Number(invoice.dueAmount) > 0 ? (
          <span className="tabular-nums text-amber-700 dark:text-amber-500">NPR {formatAmount(invoice.dueAmount)}</span>
        ) : (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">{t("paidInFull")}</span>
        ),
    },
    {
      key: "status",
      header: t("status"),
      className: "flex-none w-28",
      render: (invoice) => <InvoiceStatusBadge status={invoice.status} />,
    },
  ];

  const rowActions = (invoice) => [
    { key: "view", label: t("view"), icon: Eye, onClick: () => openDetail(invoice) },
    {
      key: "cancel",
      label: t("cancel"),
      icon: Ban,
      variant: "destructive",
      disabled: invoice.status === "cancelled" || cancellingId === invoice.id,
      onClick: () => handleCancel(invoice),
    },
  ];

  return (
    <>
      <div className="flex justify-end">
        <Button type="button" onClick={() => router.push(`/${companySlug}/sales/invoices/new`)}>
          <Plus className="h-4 w-4" />
          {t("addSalesInvoice")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialInvoices}
          selectable={false}
          onRowClick={openDetail}
          rowActions={rowActions}
          filters={[
            {
              key: "status",
              label: t("status"),
              options: [
                { value: "completed", label: t("completed") },
                { value: "cancelled", label: t("cancelled") },
              ],
            },
          ]}
          emptyIcon={Receipt}
          emptyMessage={t("noSalesInvoicesYet")}
          emptyAction={{ label: t("addSalesInvoice"), onClick: () => router.push(`/${companySlug}/sales/invoices/new`) }}
        />
      </div>
    </>
  );
}
