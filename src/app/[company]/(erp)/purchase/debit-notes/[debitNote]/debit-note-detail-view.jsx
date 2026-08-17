"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Ban, Loader2, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/toast";
import { decimalToInputValue } from "@/lib/utils";
import { StatusBadge } from "../debit-notes-view";
import { cancelDebitNoteAction, deleteDebitNoteDraftsAction } from "../actions";
import DebitNoteForm from "../debit-note-form";

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DebitNoteDetailView({ companySlug, debitNote, lines, formData }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [cancelling, startCancelTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();

  function handleCancel() {
    if (!window.confirm(t("confirmCancelDebitNote"))) return;
    startCancelTransition(async () => {
      const result = await cancelDebitNoteAction(companySlug, debitNote.id);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t(result.message));
      router.refresh();
    });
  }

  function handleDelete() {
    if (!window.confirm(t("confirmDeleteDebitNotes", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deleteDebitNoteDraftsAction(companySlug, [debitNote.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("debitNotesDeleted", { count: result.count }));
      router.push(`/${companySlug}/purchase/debit-notes`);
    });
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">{t("editDebitNote")}</h1>
          <Button type="button" variant="outline" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" />
            {t("cancel")}
          </Button>
        </div>
        <DebitNoteForm companySlug={companySlug} mode="edit" debitNote={debitNote} initialLines={lines} formData={formData} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{debitNote.debitNoteNumber}</h1>
            <StatusBadge status={debitNote.status} t={t} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {debitNote.partyName} · {debitNote.debitNoteDate}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {debitNote.status === "draft" && (
            <>
              <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
                {t("edit")}
              </Button>
              <Button type="button" variant="outline" disabled={deleting} onClick={handleDelete}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t("delete")}
              </Button>
            </>
          )}
          {debitNote.status === "completed" && (
            <Button type="button" variant="outline" disabled={cancelling} onClick={handleCancel}>
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              {t("cancelDebitNote")}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-background p-4">
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("supplier")} value={debitNote.partyName} />
          <Field label={t("warehouse")} value={debitNote.warehouseName || "—"} />
          <Field label={t("referenceNo")} value={debitNote.referenceNo || "—"} />
          <Field label={t("supplierName")} value={debitNote.supplierName || "—"} />
          <Field label={t("supplierAddress")} value={debitNote.supplierAddress || "—"} />
          <Field label={t("bankAccount")} value={debitNote.bankAccountName || "—"} />
        </div>
        {debitNote.notes && (
          <div className="mt-3 border-t pt-3 text-sm">
            <p className="text-muted-foreground">{t("notes")}</p>
            <p className="mt-1 whitespace-pre-wrap">{debitNote.notes}</p>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-2 text-left">{t("item")}</th>
              <th className="px-4 py-2 text-left">{t("unit")}</th>
              <th className="px-4 py-2 text-right">{t("quantity")}</th>
              <th className="px-4 py-2 text-right">{t("rate")}</th>
              <th className="px-4 py-2 text-right">{t("discount")}</th>
              <th className="px-4 py-2 text-right">{t("lineTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b last:border-b-0">
                <td className="px-4 py-2">
                  {line.itemName}
                  {line.variantName && <span className="ml-1 text-xs text-muted-foreground">({line.variantName})</span>}
                </td>
                <td className="px-4 py-2">{line.unitCode}</td>
                <td className="px-4 py-2 text-right tabular-nums">{decimalToInputValue(line.quantity)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatAmount(line.rate)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatAmount(line.discAmount)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatAmount(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto max-w-sm space-y-2 rounded-2xl border bg-background p-4">
        <TotalRow label={t("subtotal")} value={debitNote.subtotal} />
        <TotalRow label={t("discount")} value={debitNote.discAmount} negative />
        {debitNote.isVatApplicable === 1 && (
          <TotalRow label={`${t("vat")} (${decimalToInputValue(debitNote.vatPercent)}%)`} value={debitNote.vatAmount} />
        )}
        <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
          <span>{t("totalAmount")}</span>
          <span className="tabular-nums">{formatAmount(debitNote.totalAmount)}</span>
        </div>
        <TotalRow label={t("refundAmount")} value={debitNote.refundAmount} />
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}

function TotalRow({ label, value, negative }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        {negative && Number(value) > 0 ? "-" : ""}
        {formatAmount(value)}
      </span>
    </div>
  );
}
