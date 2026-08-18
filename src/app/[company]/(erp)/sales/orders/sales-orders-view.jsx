"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ClipboardList, Eye, Trash2 } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney } from "@/lib/money-format";
import { notify } from "@/lib/toast";
import { deleteSalesOrdersAction } from "./actions";

const ORDER_STATUSES = ["draft", "confirmed", "converted", "cancelled"];

/**
 * List shell for Sales Orders — unlike Warehouses/Parties/Items, the
 * create/edit form has line items and needs real room, so this doesn't use
 * a Sheet: "Add" and row clicks navigate to full pages (new/[order]),
 * matching how Bank Accounts' ledger view gets its own route. Editing/
 * deleting/viewing all live in the Actions column.
 *
 * The page-level create action lives in page.js's <PageHeader> now, not
 * here — this view doesn't render its own "Add" button anymore (see
 * redesign2.md's "REMOVE DUPLICATE PRIMARY ACTIONS").
 */
export default function SalesOrdersView({ companySlug, initialOrders }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, startDeleteTransition] = useTransition();

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
      className: "flex-none w-36 justify-end text-right tabular-nums",
      render: (order) => formatMoney(order.totalAmount),
    },
    {
      key: "status",
      header: t("status"),
      className: "flex-none w-32",
      render: (order) => <StatusBadge status={order.status} />,
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
      emptyDescription={t("salesOrdersEmptyHint")}
    />
  );
}
