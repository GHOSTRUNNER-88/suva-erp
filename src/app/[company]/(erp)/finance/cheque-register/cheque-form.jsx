"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DualDateField } from "@/components/dual-date-field";
import { decimalToInputValue } from "@/lib/utils";
import { createChequeAction, updateChequeAction } from "./actions";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function ChequeForm({ companySlug, cheque, parties, bankAccounts, onDone, onClose }) {
  const { t } = useTranslation();
  const isEdit = Boolean(cheque);

  const [form, setForm] = useState(() =>
    isEdit
      ? {
          chequeType: cheque.chequeType,
          chequeNumber: cheque.chequeNumber,
          chequeDate: cheque.chequeDate,
          partyId: cheque.partyId ? String(cheque.partyId) : "",
          bankAccountId: cheque.bankAccountId ? String(cheque.bankAccountId) : "",
          bankName: cheque.bankName ?? "",
          amount: decimalToInputValue(cheque.amount),
          notes: cheque.notes ?? "",
        }
      : { chequeType: "received", chequeNumber: "", chequeDate: today(), partyId: "", bankAccountId: "", bankName: "", amount: "0", notes: "" }
  );
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const partyOptions = parties.map((party) => ({ value: String(party.id), label: party.name }));
  const bankAccountOptions = bankAccounts.map((account) => ({ value: String(account.id), label: account.label }));

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit() {
    setFormError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = isEdit ? await updateChequeAction(companySlug, cheque.id, form) : await createChequeAction(companySlug, form);
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

      <div className="space-y-1.5">
        <Label>{t("chequeType")}</Label>
        <SegmentedControl
          className="h-11"
          options={[
            { value: "received", label: t("chequeReceived") },
            { value: "issued", label: t("chequeIssued") },
          ]}
          value={form.chequeType}
          onChange={(value) => update("chequeType", value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="chq-number">{t("chequeNumber")}</Label>
        <Input id="chq-number" className="h-11" value={form.chequeNumber} onChange={(event) => update("chequeNumber", event.target.value)} />
        {fieldErrors.chequeNumber?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.chequeNumber[0])}</p>}
      </div>

      <DualDateField id="chq-date" label={t("chequeDate")} value={form.chequeDate} onChange={(value) => update("chequeDate", value)} required />
      <p className="-mt-3 text-xs text-muted-foreground">{t("reminderDateHint")}</p>

      <div className="space-y-1.5">
        <Label htmlFor="chq-party">{t("party")}</Label>
        <CreatableSelect id="chq-party" options={partyOptions} value={form.partyId} onChange={(value) => update("partyId", value)} placeholder={t("optional")} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="chq-bank">{t("bankAccount")}</Label>
        <CreatableSelect id="chq-bank" options={bankAccountOptions} value={form.bankAccountId} onChange={(value) => update("bankAccountId", value)} placeholder={t("optional")} />
      </div>

      {!form.bankAccountId && (
        <div className="space-y-1.5">
          <Label htmlFor="chq-bank-name">{t("bankName")}</Label>
          <Input id="chq-bank-name" className="h-11" value={form.bankName} onChange={(event) => update("bankName", event.target.value)} placeholder={t("optional")} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="chq-amount">{t("amount")}</Label>
        <Input id="chq-amount" type="number" min="0" step="0.01" className="h-11" value={form.amount} onChange={(event) => update("amount", event.target.value)} />
        {fieldErrors.amount?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.amount[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="chq-notes">{t("notes")}</Label>
        <textarea
          id="chq-notes"
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
