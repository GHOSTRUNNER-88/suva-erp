"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DualDateField } from "@/components/dual-date-field";
import { decimalToInputValue } from "@/lib/utils";
import { createPaymentAction, getOpenDocumentsForPartyAction, updatePaymentAction } from "./actions";

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Shared Payment In / Payment Out create-edit form (Sheet content) —
 * allocation is entirely manual per legacy (see actions.js's header
 * comment): pick a party, see their open (dueAmount > 0) invoices/bills,
 * type an amount against each up to its own due, and whatever's left of
 * the payment amount is an unallocated on-account receipt.
 */
export default function PaymentForm({ companySlug, paymentType, parties, bankAccounts, payment, onDone, onClose }) {
  const { t } = useTranslation();
  const isEdit = Boolean(payment);
  const isIn = paymentType === "in";

  const [form, setForm] = useState(() =>
    isEdit
      ? {
          paymentDate: payment.paymentDate,
          partyId: payment.partyId ? String(payment.partyId) : "",
          bankAccountId: String(payment.bankAccountId),
          amount: decimalToInputValue(payment.amount),
          notes: payment.notes ?? "",
        }
      : { paymentDate: today(), partyId: "", bankAccountId: "", amount: "0", notes: "" }
  );
  const [openDocs, setOpenDocs] = useState([]);
  const [allocations, setAllocations] = useState(() =>
    isEdit ? Object.fromEntries(payment.allocations.map((a) => [a.documentId, String(a.amount)])) : {}
  );
  // Starts true when editing a payment that already has a party (the fetch
  // effect below fires on mount for that case) — false in create mode,
  // where no fetch happens until the user picks a party via onChange.
  const [loadingDocs, setLoadingDocs] = useState(() => Boolean(isEdit && payment?.partyId));
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const partyOptions = parties.map((party) => ({ value: String(party.id), label: party.name }));
  const bankAccountOptions = bankAccounts.map((account) => ({ value: String(account.id), label: account.label }));

  useEffect(() => {
    // No party selected: openDocs/loadingDocs are already cleared by the
    // party <select>'s onChange handler below (a real event handler, not an
    // effect) — nothing to synchronize here, so skip without touching state
    // from the effect body itself. The `true` branch only ever calls
    // setState inside the .then() callback (an async continuation, not the
    // synchronous effect body), matching this codebase's established
    // fetch-in-effect idiom — see items-view.jsx's pricingRows effect.
    if (!form.partyId) {
      return;
    }
    let cancelled = false;
    getOpenDocumentsForPartyAction(companySlug, paymentType, form.partyId, isEdit ? payment.id : undefined).then((docs) => {
      if (cancelled) return;
      setOpenDocs(docs);
      setLoadingDocs(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.partyId]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateAllocation(documentId, value) {
    setAllocations((current) => ({ ...current, [documentId]: value }));
  }

  const allocationEntries = Object.entries(allocations)
    .map(([documentId, value]) => ({ documentId: Number(documentId), amount: Number(value) || 0 }))
    .filter((entry) => entry.amount > 0);
  const totalAllocated = allocationEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const unallocated = Math.max(0, (Number(form.amount) || 0) - totalAllocated);

  function submit() {
    setFormError(null);
    setFieldErrors({});
    const payload = {
      paymentDate: form.paymentDate,
      partyId: form.partyId || 0,
      bankAccountId: form.bankAccountId,
      amount: form.amount,
      notes: form.notes,
      allocations: allocationEntries,
    };
    startTransition(async () => {
      const result = isEdit
        ? await updatePaymentAction(companySlug, paymentType, payment.id, payload)
        : await createPaymentAction(companySlug, paymentType, payload);
      if (!result.ok) {
        setFormError(result.formError ? t(result.formError) : t("somethingWentWrong"));
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      onDone(result.message);
    });
  }

  return (
    <div className="space-y-5">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      {isEdit && (
        <div className="space-y-1.5">
          <Label>{t("receiptNumber")}</Label>
          <Input className="h-11" value={payment.receiptNumber} disabled />
        </div>
      )}

      <DualDateField id="pmt-date" label={t("paymentDate")} value={form.paymentDate} onChange={(value) => update("paymentDate", value)} required />

      <div className="space-y-1.5">
        <Label htmlFor="pmt-party">{isIn ? t("customer") : t("supplier")}</Label>
        <CreatableSelect
          id="pmt-party"
          options={partyOptions}
          value={form.partyId}
          onChange={(value) => {
            update("partyId", value);
            setAllocations({});
            if (value) {
              setLoadingDocs(true);
            } else {
              setOpenDocs([]);
              setLoadingDocs(false);
            }
          }}
          placeholder={t("optional")}
        />
        <p className="text-xs text-muted-foreground">{t("paymentPartyHint")}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pmt-bank">{t("bankAccount")}</Label>
        <CreatableSelect id="pmt-bank" options={bankAccountOptions} value={form.bankAccountId} onChange={(value) => update("bankAccountId", value)} placeholder={t("selectBankAccount")} />
        {fieldErrors.bankAccountId?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.bankAccountId[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pmt-amount">{t("amount")}</Label>
        <Input id="pmt-amount" type="number" min="0" step="0.01" className="h-11" value={form.amount} onChange={(event) => update("amount", event.target.value)} />
        {fieldErrors.amount?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.amount[0])}</p>}
      </div>

      {form.partyId ? (
        <div className="space-y-2 rounded-2xl border bg-background p-4">
          <h3 className="text-sm font-semibold">{t("allocateAgainstDocuments")}</h3>
          {loadingDocs ? (
            <p className="text-xs text-muted-foreground">{t("loading")}</p>
          ) : openDocs.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("noOpenDocumentsForParty")}</p>
          ) : (
            <div className="space-y-2">
              {openDocs.map((doc) => (
                <div key={doc.documentId} className="flex items-center gap-3 rounded-xl border bg-muted/40 p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.documentNo}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.documentDate} · {t("due")}: {formatAmount(doc.dueAmount)}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max={doc.dueAmount}
                    step="0.01"
                    className="h-9 w-28"
                    value={allocations[doc.documentId] ?? ""}
                    onChange={(event) => updateAllocation(doc.documentId, event.target.value)}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t pt-2 text-sm">
            <span className="text-muted-foreground">{t("unallocatedAmount")}</span>
            <span className="tabular-nums font-medium">{formatAmount(unallocated)}</span>
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="pmt-notes">{t("notes")}</Label>
        <textarea
          id="pmt-notes"
          rows={2}
          className="w-full rounded-xl border border-transparent bg-muted/60 p-3 text-sm outline-none hover:bg-muted focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50"
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {pending ? t("saving") : t("saveChanges")}
        </Button>
      </div>
    </div>
  );
}
