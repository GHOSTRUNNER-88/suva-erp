"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Eye, Plus, ReceiptText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { deletePurchaseBillDraftsAction } from "./actions";

const STATUS_OPTIONS = ["draft", "completed", "cancelled"];

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
 * List shell for Purchase Bills — same page -> {Module}View -> DataTable
 * shape as Purchase Orders, routing to dedicated new/[bill] pages instead
 * of a Sheet (the line-items table needs real width).
 */
export default function PurchaseBillsView({ companySlug, initialBills }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, startDeleteTransition] = useTransition();

  function openDetail(bill) {
    router.push(`/${companySlug}/purchase/bills/${bill.id}`);
  }

  function handleDeleteOne(bill) {
    if (!window.confirm(t("confirmDeletePurchaseBills", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deletePurchaseBillDraftsAction(companySlug, [bill.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("purchaseBillsDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeletePurchaseBills", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deletePurchaseBillDraftsAction(companySlug, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("purchaseBillsDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [
    {
      key: "billNumber",
      header: t("billNumber"),
      sortable: true,
      render: (bill) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{bill.billNumber}</p>
          <p className="truncate text-xs text-muted-foreground">{bill.billDate}</p>
        </div>
      ),
    },
    { key: "partyName", header: t("supplier"), sortable: true },
    { key: "warehouseName", header: t("warehouse"), render: (bill) => bill.warehouseName || "—" },
    {
      key: "totalAmount",
      header: t("totalAmount"),
      sortable: true,
      className: "flex-none w-32 justify-end text-right",
      render: (bill) => <span className="tabular-nums">{formatAmount(bill.totalAmount)}</span>,
    },
    {
      key: "dueAmount",
      header: t("dueAmount"),
      className: "flex-none w-32 justify-end text-right",
      render: (bill) => (
        <span className={cn("tabular-nums", Number(bill.dueAmount) > 0 && "text-destructive")}>{formatAmount(bill.dueAmount)}</span>
      ),
    },
    {
      key: "status",
      header: t("status"),
      render: (bill) => <StatusBadge status={bill.status} t={t} />,
    },
  ];

  const rowActions = (bill) => [
    { key: "view", label: t("view"), icon: Eye, onClick: () => openDetail(bill) },
    ...(bill.status === "draft"
      ? [
          {
            key: "delete",
            label: t("delete"),
            icon: Trash2,
            variant: "destructive",
            disabled: deleting,
            onClick: () => handleDeleteOne(bill),
          },
        ]
      : []),
  ];

  const bulkActions = (ids, helpers) => [
    {
      key: "delete",
      label: t("delete"),
      icon: Trash2,
      variant: "destructive",
      loading: deleting,
      onClick: () => handleBulkDelete(ids, helpers),
    },
  ];

  return (
    <>
      <div className="flex justify-end">
        <Button type="button" onClick={() => router.push(`/${companySlug}/purchase/bills/new`)}>
          <Plus className="h-4 w-4" />
          {t("addPurchaseBill")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialBills}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onRowClick={openDetail}
          rowActions={rowActions}
          bulkActions={bulkActions}
          filters={[
            {
              key: "status",
              label: t("status"),
              options: STATUS_OPTIONS.map((status) => ({ value: status, label: t(status) })),
            },
          ]}
          emptyIcon={ReceiptText}
          emptyMessage={t("noPurchaseBillsYet")}
          emptyAction={{ label: t("addPurchaseBill"), onClick: () => router.push(`/${companySlug}/purchase/bills/new`) }}
        />
      </div>
    </>
  );
}
