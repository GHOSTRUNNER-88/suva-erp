"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ClipboardList, Eye, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { deletePurchaseOrdersAction } from "./actions";

const STATUS_OPTIONS = ["draft", "ordered", "received", "cancelled"];

const STATUS_STYLES = {
  draft: "bg-muted text-muted-foreground",
  ordered: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  received: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
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
 * List shell for Purchase Orders — mirrors WarehousesView/BankAccountsView's
 * page -> {Module}View -> DataTable shape, but "Add"/row-click route to
 * dedicated pages (new/[order]) instead of a Sheet form: an order's line
 * items table needs far more width than the Sheet's max-w-md panel gives.
 */
export default function PurchaseOrdersView({ companySlug, initialOrders }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, startDeleteTransition] = useTransition();

  function openDetail(order) {
    router.push(`/${companySlug}/purchase/orders/${order.id}`);
  }

  function handleDeleteOne(order) {
    if (!window.confirm(t("confirmDeletePurchaseOrders", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deletePurchaseOrdersAction(companySlug, [order.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("purchaseOrdersDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeletePurchaseOrders", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deletePurchaseOrdersAction(companySlug, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("purchaseOrdersDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [
    {
      key: "orderNumber",
      header: t("orderNumber"),
      sortable: true,
      render: (order) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{order.orderNumber}</p>
          <p className="truncate text-xs text-muted-foreground">{order.orderDate}</p>
        </div>
      ),
    },
    { key: "partyName", header: t("supplier"), sortable: true },
    { key: "warehouseName", header: t("warehouse"), render: (order) => order.warehouseName || "—" },
    {
      key: "totalAmount",
      header: t("totalAmount"),
      sortable: true,
      className: "flex-none w-36 justify-end text-right",
      render: (order) => <span className="tabular-nums">{formatAmount(order.totalAmount)}</span>,
    },
    {
      key: "status",
      header: t("status"),
      render: (order) => <StatusBadge status={order.status} t={t} />,
    },
  ];

  const rowActions = (order) => [
    { key: "view", label: t("view"), icon: Eye, onClick: () => openDetail(order) },
    {
      key: "delete",
      label: t("delete"),
      icon: Trash2,
      variant: "destructive",
      disabled: deleting,
      onClick: () => handleDeleteOne(order),
    },
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
        <Button type="button" onClick={() => router.push(`/${companySlug}/purchase/orders/new`)}>
          <Plus className="h-4 w-4" />
          {t("addPurchaseOrder")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialOrders}
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
          emptyIcon={ClipboardList}
          emptyMessage={t("noPurchaseOrdersYet")}
          emptyAction={{ label: t("addPurchaseOrder"), onClick: () => router.push(`/${companySlug}/purchase/orders/new`) }}
        />
      </div>
    </>
  );
}
