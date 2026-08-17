"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Eye, Plus, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = ["completed", "cancelled"];
const TYPE_OPTIONS = ["sales_return", "price_protection"];

const STATUS_STYLES = {
  draft: "bg-muted text-muted-foreground",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-destructive/10 text-destructive",
};

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function StatusBadge({ status, t }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLES[status] ?? STATUS_STYLES.draft)}>
      {t(status)}
    </span>
  );
}

/**
 * List shell for Credit Notes — same page -> {Module}View -> DataTable
 * shape as Debit Notes, routing to a dedicated new/[creditNote] page. No
 * draft/delete support here (unlike Debit Notes) — actions.js always
 * creates a credit note directly as "completed"; the only way to undo one
 * is cancelCreditNoteAction from the detail page.
 */
export default function CreditNotesView({ companySlug, initialCreditNotes }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState(new Set());

  function openDetail(creditNote) {
    router.push(`/${companySlug}/sales/credit-notes/${creditNote.id}`);
  }

  const columns = [
    {
      key: "creditNoteNumber",
      header: t("creditNoteNumber"),
      sortable: true,
      render: (creditNote) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{creditNote.creditNoteNumber}</p>
          <p className="truncate text-xs text-muted-foreground">{creditNote.creditNoteDate}</p>
        </div>
      ),
    },
    { key: "partyName", header: t("customer"), sortable: true },
    {
      key: "creditNoteType",
      header: t("creditNoteType"),
      render: (creditNote) => t(creditNote.creditNoteType === "sales_return" ? "salesReturn" : "priceProtection"),
    },
    {
      key: "totalAmount",
      header: t("totalAmount"),
      sortable: true,
      className: "flex-none w-36 justify-end text-right",
      render: (creditNote) => <span className="tabular-nums">{formatAmount(creditNote.totalAmount)}</span>,
    },
    {
      key: "isRefunded",
      header: t("refunded"),
      render: (creditNote) => (creditNote.isRefunded === 1 ? t("yes") : t("no")),
    },
    {
      key: "status",
      header: t("status"),
      render: (creditNote) => <StatusBadge status={creditNote.status} t={t} />,
    },
  ];

  const rowActions = (creditNote) => [{ key: "view", label: t("view"), icon: Eye, onClick: () => openDetail(creditNote) }];

  return (
    <>
      <div className="flex justify-end">
        <Button type="button" onClick={() => router.push(`/${companySlug}/sales/credit-notes/new`)}>
          <Plus className="h-4 w-4" />
          {t("addCreditNote")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialCreditNotes}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onRowClick={openDetail}
          rowActions={rowActions}
          filters={[
            {
              key: "status",
              label: t("status"),
              options: STATUS_OPTIONS.map((status) => ({ value: status, label: t(status) })),
            },
            {
              key: "creditNoteType",
              label: t("creditNoteType"),
              options: TYPE_OPTIONS.map((type) => ({ value: type, label: t(type === "sales_return" ? "salesReturn" : "priceProtection") })),
            },
          ]}
          emptyIcon={ReceiptText}
          emptyMessage={t("noCreditNotesYet")}
          emptyAction={{ label: t("addCreditNote"), onClick: () => router.push(`/${companySlug}/sales/credit-notes/new`) }}
        />
      </div>
    </>
  );
}
