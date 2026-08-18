"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Eye, FileText, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { notify } from "@/lib/toast";
import { deleteSalesQuotationsAction } from "./actions";

const QUOTATION_STATUSES = ["draft", "sent", "accepted", "converted", "expired", "cancelled"];

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * List shell for Sales Quotations — same full-page create/edit shape as
 * Sales Orders (../orders/sales-orders-view.jsx), reused here since a
 * quotation's line items need the same room a Sheet can't give.
 */
export default function SalesQuotationsView({ companySlug, initialQuotations }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, startDeleteTransition] = useTransition();

  function openNew() {
    router.push(`/${companySlug}/sales/quotations/new`);
  }

  function openDetail(quotation) {
    router.push(`/${companySlug}/sales/quotations/${quotation.id}`);
  }

  function handleDeleteOne(quotation) {
    if (!window.confirm(t("confirmDeleteSalesQuotations", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deleteSalesQuotationsAction(companySlug, [quotation.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("salesQuotationsDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeleteSalesQuotations", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deleteSalesQuotationsAction(companySlug, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("salesQuotationsDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [
    {
      key: "quotationNumber",
      header: t("quotationNumber"),
      sortable: true,
      render: (quotation) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{quotation.quotationNumber}</p>
          <p className="truncate text-xs text-muted-foreground">{quotation.quotationDate}</p>
        </div>
      ),
    },
    { key: "partyName", header: t("party") },
    { key: "validUntil", header: t("validUntil"), render: (quotation) => quotation.validUntil || "—" },
    {
      key: "totalAmount",
      header: t("totalAmount"),
      sortable: true,
      className: "flex-none w-32 justify-end text-right",
      render: (quotation) => formatAmount(quotation.totalAmount),
    },
    {
      key: "status",
      header: t("status"),
      render: (quotation) => <StatusBadge status={quotation.status} />,
    },
  ];

  const rowActions = (quotation) => [
    { key: "view", label: t("view"), icon: Eye, onClick: () => openDetail(quotation) },
    {
      key: "delete",
      label: t("delete"),
      icon: Trash2,
      variant: "destructive",
      disabled: deleting,
      onClick: () => handleDeleteOne(quotation),
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
          {t("addSalesQuotation")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialQuotations}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onRowClick={openDetail}
          rowActions={rowActions}
          bulkActions={bulkActions}
          filters={[
            {
              key: "status",
              label: t("status"),
              options: QUOTATION_STATUSES.map((status) => ({ value: status, label: t(status) })),
            },
          ]}
          emptyIcon={FileText}
          emptyMessage={t("noSalesQuotationsYet")}
          emptyAction={{ label: t("addSalesQuotation"), onClick: openNew }}
        />
      </div>
    </>
  );
}
