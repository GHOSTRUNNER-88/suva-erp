"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ClipboardList, Eye, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { deleteSalesOrdersAction } from "./actions";

const ORDER_STATUSES = ["draft", "confirmed", "converted", "cancelled"];

const STATUS_STYLES = {
  draft: "bg-muted text-muted-foreground",
  confirmed: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  converted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-destructive/10 text-destructive",
};

export function StatusBadge({ status, styles }) {
  const { t } = useTranslation();
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", styles[status] ?? "bg-muted text-muted-foreground")}>
      {t(status)}
    </span>
  );
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * List shell for Sales Orders — unlike Warehouses/Parties/Items, the
 * create/edit form has line items and needs real room, so this doesn't use
 * a Sheet: "Add" and row clicks navigate to full pages (new/[order]),
 * matching how Bank Accounts' ledger view gets its own route. Editing/
 * deleting/viewing all live in the Actions column.
 */
export default function SalesOrdersView({ companySlug, initialOrders }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, startDeleteTransition] = useTransition();

  function openNew() {
    router.push(`/${companySlug}/sales/orders/new`);
  }

  function openDetail(order) {
    router.push(`/${companySlug}/sales/orders/${order.id}`);
  }

  function handleDeleteOne(order) {
    if (!window.confirm(t("confirmDeleteSalesOrders", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deleteSalesOrdersAction(companySlug, [order.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("salesOrdersDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeleteSalesOrders", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deleteSalesOrdersAction(companySlug, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("salesOrdersDeleted", { count: result.count }));
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
    { key: "partyName", header: t("party") },
    { key: "warehouseName", header: t("warehouse"), render: (order) => order.warehouseName || t("notSet") },
    {
      key: "totalAmount",
      header: t("totalAmount"),
      sortable: true,
      className: "flex-none w-32 justify-end text-right",
      render: (order) => formatAmount(order.totalAmount),
    },
    {
      key: "status",
      header: t("status"),
      render: (order) => <StatusBadge status={order.status} styles={STATUS_STYLES} />,
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
        <Button type="button" onClick={openNew}>
          <Plus className="h-4 w-4" />
          {t("addSalesOrder")}
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
              options: ORDER_STATUSES.map((status) => ({ value: status, label: t(status) })),
            },
          ]}
          emptyIcon={ClipboardList}
          emptyMessage={t("noSalesOrdersYet")}
          emptyAction={{ label: t("addSalesOrder"), onClick: openNew }}
        />
      </div>
    </>
  );
}
