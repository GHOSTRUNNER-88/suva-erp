"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Eye, Plus, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { notify } from "@/lib/toast";
import { deleteDeliveryChallansAction } from "./actions";

const CHALLAN_STATUSES = ["pending", "delivered", "cancelled"];

// sourceId is an unenforced polymorphic reference (see actions.js) — purely
// a display label here, resolved without assuming sales/invoices or
// purchase/bills exist yet as real linked records.
export function sourceLabel(t, sourceType, sourceId) {
  if (sourceType === "sale") return t("challanSourceSale", { id: sourceId });
  if (sourceType === "purchase") return t("challanSourcePurchase", { id: sourceId });
  return t("challanSourceManual");
}

/**
 * List shell for Delivery Challans — same full-page create/edit shape as
 * Sales Orders/Quotations (line items need real room, not a Sheet).
 */
export default function DeliveryChallansView({ companySlug, initialChallans }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, startDeleteTransition] = useTransition();

  function openNew() {
    router.push(`/${companySlug}/sales/delivery-challans/new`);
  }

  function openDetail(challan) {
    router.push(`/${companySlug}/sales/delivery-challans/${challan.id}`);
  }

  function handleDeleteOne(challan) {
    if (!window.confirm(t("confirmDeleteDeliveryChallans", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deleteDeliveryChallansAction(companySlug, [challan.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("deliveryChallansDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeleteDeliveryChallans", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deleteDeliveryChallansAction(companySlug, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("deliveryChallansDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [
    {
      key: "challanNumber",
      header: t("challanNumber"),
      sortable: true,
      render: (challan) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{challan.challanNumber}</p>
          <p className="truncate text-xs text-muted-foreground">{challan.challanDate}</p>
        </div>
      ),
    },
    { key: "partyName", header: t("party") },
    { key: "warehouseName", header: t("warehouse"), render: (challan) => challan.warehouseName || t("notSet") },
    {
      key: "sourceType",
      header: t("source"),
      render: (challan) => sourceLabel(t, challan.sourceType, challan.sourceId),
    },
    {
      key: "stockDeducted",
      header: t("stockDeducted"),
      render: (challan) => (challan.stockDeducted === 1 ? t("yes") : t("no")),
    },
    {
      key: "status",
      header: t("status"),
      render: (challan) => <StatusBadge status={challan.status} />,
    },
  ];

  const rowActions = (challan) => [
    { key: "view", label: t("view"), icon: Eye, onClick: () => openDetail(challan) },
    {
      key: "delete",
      label: t("delete"),
      icon: Trash2,
      variant: "destructive",
      disabled: deleting,
      onClick: () => handleDeleteOne(challan),
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
          {t("addDeliveryChallan")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialChallans}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onRowClick={openDetail}
          rowActions={rowActions}
          bulkActions={bulkActions}
          filters={[
            {
              key: "status",
              label: t("status"),
              options: CHALLAN_STATUSES.map((status) => ({ value: status, label: t(status) })),
            },
          ]}
          emptyIcon={Truck}
          emptyMessage={t("noDeliveryChallansYet")}
          emptyAction={{ label: t("addDeliveryChallan"), onClick: openNew }}
        />
      </div>
    </>
  );
}
