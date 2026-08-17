"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Eye, FileMinus2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { deleteDebitNoteDraftsAction } from "./actions";

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
 * List shell for Debit Notes — same page -> {Module}View -> DataTable shape
 * as Purchase Orders/Bills, routing to dedicated new/[debitNote] pages.
 */
export default function DebitNotesView({ companySlug, initialDebitNotes }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, startDeleteTransition] = useTransition();

  function openDetail(debitNote) {
    router.push(`/${companySlug}/purchase/debit-notes/${debitNote.id}`);
  }

  function handleDeleteOne(debitNote) {
    if (!window.confirm(t("confirmDeleteDebitNotes", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deleteDebitNoteDraftsAction(companySlug, [debitNote.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("debitNotesDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeleteDebitNotes", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deleteDebitNoteDraftsAction(companySlug, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("debitNotesDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [
    {
      key: "debitNoteNumber",
      header: t("debitNoteNumber"),
      sortable: true,
      render: (debitNote) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{debitNote.debitNoteNumber}</p>
          <p className="truncate text-xs text-muted-foreground">{debitNote.debitNoteDate}</p>
        </div>
      ),
    },
    { key: "partyName", header: t("supplier"), sortable: true },
    { key: "warehouseName", header: t("warehouse"), render: (debitNote) => debitNote.warehouseName || "—" },
    {
      key: "totalAmount",
      header: t("totalAmount"),
      sortable: true,
      className: "flex-none w-36 justify-end text-right",
      render: (debitNote) => <span className="tabular-nums">{formatAmount(debitNote.totalAmount)}</span>,
    },
    {
      key: "status",
      header: t("status"),
      render: (debitNote) => <StatusBadge status={debitNote.status} t={t} />,
    },
  ];

  const rowActions = (debitNote) => [
    { key: "view", label: t("view"), icon: Eye, onClick: () => openDetail(debitNote) },
    ...(debitNote.status === "draft"
      ? [
          {
            key: "delete",
            label: t("delete"),
            icon: Trash2,
            variant: "destructive",
            disabled: deleting,
            onClick: () => handleDeleteOne(debitNote),
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
        <Button type="button" onClick={() => router.push(`/${companySlug}/purchase/debit-notes/new`)}>
          <Plus className="h-4 w-4" />
          {t("addDebitNote")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialDebitNotes}
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
          emptyIcon={FileMinus2}
          emptyMessage={t("noDebitNotesYet")}
          emptyAction={{ label: t("addDebitNote"), onClick: () => router.push(`/${companySlug}/purchase/debit-notes/new`) }}
        />
      </div>
    </>
  );
}
