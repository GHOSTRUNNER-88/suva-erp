"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { CircleDollarSign, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Sheet } from "@/components/ui/sheet";
import { notify } from "@/lib/toast";
import { deletePaymentAction, getPaymentForEditAction } from "./actions";
import PaymentForm from "./payment-form";

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Shared list shell for Payment In / Payment Out — a Sheet-based
 * create/edit form (matches bank-accounts' pattern) rather than a
 * dedicated page, since a payment has no line items to need the room.
 */
export default function PaymentsListView({ companySlug, paymentType, initialPayments, parties, bankAccounts }) {
  const { t } = useTranslation();
  const router = useRouter();
  const isIn = paymentType === "in";
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [deleting, startDeleteTransition] = useTransition();

  function openCreate() {
    setEditingPayment(null);
    setSheetOpen(true);
  }

  async function openEdit(row) {
    const full = await getPaymentForEditAction(companySlug, paymentType, row.id);
    setEditingPayment(full);
    setSheetOpen(true);
  }

  function handleDeleteOne(row) {
    if (!window.confirm(t("confirmDeletePayments", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deletePaymentAction(companySlug, paymentType, [row.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("paymentsDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeletePayments", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deletePaymentAction(companySlug, paymentType, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("paymentsDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [
    {
      key: "receiptNumber",
      header: t("receiptNumber"),
      sortable: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.receiptNumber}</p>
          <p className="truncate text-xs text-muted-foreground">{row.paymentDate}</p>
        </div>
      ),
    },
    { key: "partyName", header: isIn ? t("customer") : t("supplier"), render: (row) => row.partyName || "—" },
    { key: "bankLabel", header: t("bankAccount") },
    {
      key: "amount",
      header: t("amount"),
      sortable: true,
      className: "flex-none w-36 justify-end text-right",
      render: (row) => <span className="tabular-nums">{formatAmount(row.amount)}</span>,
    },
  ];

  const rowActions = (row) => [
    { key: "edit", label: t("edit"), icon: Pencil, onClick: () => openEdit(row) },
    { key: "delete", label: t("delete"), icon: Trash2, variant: "destructive", disabled: deleting, onClick: () => handleDeleteOne(row) },
  ];

  const bulkActions = (ids, helpers) => [
    { key: "delete", label: t("delete"), icon: Trash2, variant: "destructive", loading: deleting, onClick: () => handleBulkDelete(ids, helpers) },
  ];

  return (
    <>
      <div className="flex justify-end">
        <Button type="button" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {isIn ? t("addPaymentIn") : t("addPaymentOut")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialPayments}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onRowClick={openEdit}
          rowActions={rowActions}
          bulkActions={bulkActions}
          emptyIcon={CircleDollarSign}
          emptyMessage={isIn ? t("noPaymentInYet") : t("noPaymentOutYet")}
          emptyAction={{ label: isIn ? t("addPaymentIn") : t("addPaymentOut"), onClick: openCreate }}
        />
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={editingPayment ? t("editPayment") : isIn ? t("addPaymentIn") : t("addPaymentOut")}>
        <PaymentForm
          companySlug={companySlug}
          paymentType={paymentType}
          parties={parties}
          bankAccounts={bankAccounts}
          payment={editingPayment}
          onDone={(message) => {
            setSheetOpen(false);
            notify.success(t(message));
            router.refresh();
          }}
          onClose={() => setSheetOpen(false)}
        />
      </Sheet>
    </>
  );
}
