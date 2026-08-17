"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Ban, Banknote, Check, Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Sheet } from "@/components/ui/sheet";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { deleteChequesAction, updateChequeStatusAction } from "./actions";
import ChequeForm from "./cheque-form";

const STATUS_STYLES = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  cleared: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  bounced: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusBadge({ status, t }) {
  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLES[status])}>{t(status)}</span>;
}

/**
 * Cheque Register — a standalone tracker, not linked to Payments (see
 * actions.js's header comment). Sheet-based create/edit, plus inline
 * status-transition actions (pending -> cleared/bounced/cancelled) that
 * only ever touch this table, never the bank ledger.
 */
export default function ChequeRegisterView({ companySlug, initialCheques, parties, bankAccounts, attentionCounts }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingCheque, setEditingCheque] = useState(null);
  const [busy, startTransition] = useTransition();

  function openCreate() {
    setEditingCheque(null);
    setSheetOpen(true);
  }

  function openEdit(cheque) {
    setEditingCheque(cheque);
    setSheetOpen(true);
  }

  function setStatus(cheque, status) {
    startTransition(async () => {
      const result = await updateChequeStatusAction(companySlug, cheque.id, status);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t(result.message));
      router.refresh();
    });
  }

  function handleDeleteOne(cheque) {
    if (!window.confirm(t("confirmDeleteCheques", { count: 1 }))) return;
    startTransition(async () => {
      const result = await deleteChequesAction(companySlug, [cheque.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("chequesDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeleteCheques", { count }))) return;
    startTransition(async () => {
      const result = await deleteChequesAction(companySlug, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("chequesDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [
    {
      key: "chequeNumber",
      header: t("chequeNumber"),
      sortable: true,
      render: (cheque) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{cheque.chequeNumber}</p>
          <p className="truncate text-xs text-muted-foreground">{cheque.chequeDate}</p>
        </div>
      ),
    },
    { key: "chequeType", header: t("chequeType"), render: (cheque) => t(cheque.chequeType === "received" ? "chequeReceived" : "chequeIssued") },
    { key: "partyName", header: t("party"), render: (cheque) => cheque.partyName || "—" },
    { key: "bankLabel", header: t("bank"), render: (cheque) => cheque.bankLabel || "—" },
    {
      key: "amount",
      header: t("amount"),
      sortable: true,
      className: "flex-none w-32 justify-end text-right",
      render: (cheque) => <span className="tabular-nums">{formatAmount(cheque.amount)}</span>,
    },
    { key: "status", header: t("status"), render: (cheque) => <StatusBadge status={cheque.status} t={t} /> },
  ];

  const rowActions = (cheque) => [
    ...(cheque.status === "pending"
      ? [
          { key: "clear", label: t("markCleared"), icon: Check, onClick: () => setStatus(cheque, "cleared"), disabled: busy },
          { key: "bounce", label: t("markBounced"), icon: Ban, variant: "destructive", onClick: () => setStatus(cheque, "bounced"), disabled: busy },
        ]
      : []),
    { key: "edit", label: t("edit"), icon: Pencil, onClick: () => openEdit(cheque) },
    { key: "delete", label: t("delete"), icon: Trash2, variant: "destructive", disabled: busy, onClick: () => handleDeleteOne(cheque) },
  ];

  const bulkActions = (ids, helpers) => [
    { key: "delete", label: t("delete"), icon: Trash2, variant: "destructive", loading: busy, onClick: () => handleBulkDelete(ids, helpers) },
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={Banknote} label={t("pendingCheques")} value={attentionCounts.pendingCount} />
        <StatCard icon={Ban} label={t("overdueCheques")} value={attentionCounts.overdueCount} tone="destructive" />
        <StatCard icon={Landmark} label={t("pendingChequeAmount")} value={formatAmount(attentionCounts.pendingAmount)} />
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t("addCheque")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialCheques}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onRowClick={openEdit}
          rowActions={rowActions}
          bulkActions={bulkActions}
          filters={[
            {
              key: "status",
              label: t("status"),
              options: ["pending", "cleared", "bounced", "cancelled"].map((status) => ({ value: status, label: t(status) })),
            },
            {
              key: "chequeType",
              label: t("chequeType"),
              options: [
                { value: "received", label: t("chequeReceived") },
                { value: "issued", label: t("chequeIssued") },
              ],
            },
          ]}
          emptyIcon={Banknote}
          emptyMessage={t("noChequesYet")}
          emptyAction={{ label: t("addCheque"), onClick: openCreate }}
        />
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={editingCheque ? t("editCheque") : t("addCheque")}>
        <ChequeForm
          companySlug={companySlug}
          cheque={editingCheque}
          parties={parties}
          bankAccounts={bankAccounts}
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

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-background p-4">
      <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tone === "destructive" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}
