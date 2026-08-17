"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DualDateField } from "@/components/dual-date-field";
import { notify } from "@/lib/toast";
import { calcDocumentTotals, calcLineTotal } from "@/lib/money";
import { decimalToInputValue } from "@/lib/utils";
import { createPurchaseBillAction, suggestPurchaseBillNumber, updatePurchaseBillAction } from "./actions";

let lineKeySeed = 0;
function nextLineKey() {
  lineKeySeed += 1;
  return `line-${Date.now()}-${lineKeySeed}`;
}

function emptyLine() {
  return { key: nextLineKey(), itemId: "", variantId: "", unitId: "", quantity: "1", rate: "0", discType: "percent", discValue: "0" };
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function linesFromDetail(detailLines) {
  return detailLines.map((line) => ({
    key: nextLineKey(),
    itemId: String(line.itemId),
    variantId: line.variantId ? String(line.variantId) : "",
    unitId: String(line.unitId),
    quantity: decimalToInputValue(line.quantity),
    rate: decimalToInputValue(line.rate),
    discType: line.discType,
    discValue: line.discType === "percent" ? decimalToInputValue(line.discPercent) : decimalToInputValue(line.discAmount),
  }));
}

function linesFromPrefill(prefillLines) {
  return prefillLines.map((line) => ({
    key: nextLineKey(),
    itemId: String(line.itemId ?? ""),
    variantId: line.variantId ? String(line.variantId) : "",
    unitId: String(line.unitId ?? ""),
    quantity: String(line.quantity ?? "1"),
    rate: String(line.rate ?? "0"),
    discType: line.discType ?? "percent",
    discValue: String(line.discValue ?? "0"),
  }));
}

/**
 * Create/edit form for a Purchase Bill — mirrors order-form.jsx's shape
 * with the additions a bill needs over an order: a required warehouse
 * (inventory has to land somewhere), a bank account + paid amount for a
 * same-time payment, and a manually-overridable billNumber that re-suggests
 * itself when the warehouse changes (the suggestion is warehouse-scoped).
 */
export default function BillForm({ companySlug, mode, bill, initialLines, formData, prefill }) {
  const { t } = useTranslation();
  const router = useRouter();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(() => {
    if (isEdit && bill) {
      return {
        billNumber: bill.billNumber,
        billDate: bill.billDate,
        partyId: String(bill.partyId),
        supplierName: bill.supplierName ?? "",
        supplierAddress: bill.supplierAddress ?? "",
        panNumber: bill.panNumber ?? "",
        bankAccountId: bill.bankAccountId ? String(bill.bankAccountId) : "",
        warehouseId: bill.warehouseId ? String(bill.warehouseId) : "",
        discType: bill.discType,
        discValue: bill.discType === "percent" ? decimalToInputValue(bill.discPercent) : decimalToInputValue(bill.discAmount),
        isVatApplicable: bill.isVatApplicable === 1,
        vatPercent: decimalToInputValue(bill.vatPercent ?? 0),
        isPaid: bill.isPaid === 1,
        paidAmount: decimalToInputValue(bill.paidAmount),
        notes: bill.notes ?? "",
        status: bill.status,
      };
    }
    return {
      billNumber: formData.suggestedBillNumber,
      billDate: "",
      partyId: prefill?.partyId ? String(prefill.partyId) : "",
      supplierName: "",
      supplierAddress: "",
      panNumber: "",
      bankAccountId: "",
      warehouseId: prefill?.warehouseId ? String(prefill.warehouseId) : "",
      discType: "percent",
      discValue: "0",
      isVatApplicable: formData.defaultVatEnabled,
      vatPercent: String(formData.defaultVatPercent),
      isPaid: false,
      paidAmount: "0",
      notes: "",
      status: "completed",
    };
  });
  const [lines, setLines] = useState(() =>
    isEdit && initialLines ? linesFromDetail(initialLines) : prefill?.lines?.length ? linesFromPrefill(prefill.lines) : [emptyLine()]
  );
  const [suggestedNumber, setSuggestedNumber] = useState(formData.suggestedBillNumber);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const partyOptions = formData.parties.map((party) => ({ value: String(party.id), label: party.name }));
  const warehouseOptions = formData.warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name }));
  const itemOptions = formData.items.map((item) => ({ value: String(item.id), label: item.name }));
  const bankAccountOptions = formData.bankAccounts.map((account) => ({
    value: String(account.id),
    label: account.displayName ? `${account.bankName} (${account.displayName})` : account.bankName,
  }));
  const variantOptions = [
    { value: "", label: t("noVariant") },
    ...formData.attributeValues.map((value) => ({ value: String(value.id), label: `${value.name} (${value.attributeName})` })),
  ];
  const itemsById = useMemo(() => new Map(formData.items.map((item) => [String(item.id), item])), [formData.items]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function selectParty(partyId) {
    const party = formData.parties.find((p) => String(p.id) === partyId);
    setForm((current) => ({
      ...current,
      partyId,
      supplierName: party?.name ?? current.supplierName,
      supplierAddress: party?.address ?? current.supplierAddress,
      panNumber: party?.panNumber ?? current.panNumber,
    }));
  }

  async function selectWarehouse(warehouseId) {
    update("warehouseId", warehouseId);
    // Only auto-refresh the number suggestion on create, and only while the
    // user hasn't already typed something else in — billNumber is a manual
    // override field, this is just a convenience re-suggestion.
    if (isEdit || form.billNumber !== suggestedNumber) return;
    const next = await suggestPurchaseBillNumber(companySlug, warehouseId);
    setSuggestedNumber(next);
    update("billNumber", next);
  }

  function updateLine(key, field, value) {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, [field]: value };
        if (field === "itemId") {
          const item = itemsById.get(value);
          if (item) {
            next.unitId = String(item.primaryUnitId);
            next.rate = decimalToInputValue(item.purchasePrice);
          }
        }
        return next;
      })
    );
  }

  function unitOptionsForLine(line) {
    const item = itemsById.get(line.itemId);
    if (!item) return formData.units.map((unit) => ({ value: String(unit.id), label: unit.code }));
    const options = [{ value: String(item.primaryUnitId), label: item.primaryUnitCode }];
    if (item.secondaryUnitId) options.push({ value: String(item.secondaryUnitId), label: item.secondaryUnitCode });
    return options;
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }

  function removeLine(key) {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.key !== key) : current));
  }

  const computedLines = lines.map((line) =>
    calcLineTotal({ quantity: Math.round(Number(line.quantity) || 0), rate: line.rate, discType: line.discType, discValue: line.discValue })
  );
  const documentTotals = calcDocumentTotals({
    lines: computedLines,
    discType: form.discType,
    discValue: form.discValue,
    vatPercent: form.vatPercent,
    isVatApplicable: form.isVatApplicable,
  });

  function submit() {
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    startSubmit();
  }

  async function startSubmit() {
    const payload = {
      ...form,
      lines: lines.map((line) => ({
        itemId: line.itemId,
        variantId: line.variantId || null,
        unitId: line.unitId,
        quantity: line.quantity,
        rate: line.rate,
        discType: line.discType,
        discValue: line.discValue,
      })),
    };
    const result = isEdit
      ? await updatePurchaseBillAction(companySlug, bill.id, payload)
      : await createPurchaseBillAction(companySlug, payload);
    setPending(false);
    if (!result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
      return;
    }
    notify.success(t(result.message));
    router.push(`/${companySlug}/purchase/bills/${isEdit ? bill.id : result.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-2xl border bg-background p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="pb-bill-number">{t("billNumber")}</Label>
            <Input id="pb-bill-number" className="h-11" value={form.billNumber} onChange={(event) => update("billNumber", event.target.value)} />
            <p className="text-xs text-muted-foreground">{t("billNumberHint")}</p>
            {fieldErrors.billNumber?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.billNumber[0])}</p>}
          </div>
          <DualDateField id="pb-bill-date" label={t("billDate")} value={form.billDate} onChange={(value) => update("billDate", value)} required />
          <div className="space-y-1.5">
            <Label htmlFor="pb-warehouse">{t("warehouse")}</Label>
            <CreatableSelect id="pb-warehouse" options={warehouseOptions} value={form.warehouseId} onChange={selectWarehouse} placeholder={t("selectWarehouse")} />
            {fieldErrors.warehouseId?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.warehouseId[0])}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pb-party">{t("supplier")}</Label>
            <CreatableSelect id="pb-party" options={partyOptions} value={form.partyId} onChange={selectParty} placeholder={t("selectSupplier")} />
            {fieldErrors.partyId?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.partyId[0])}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pb-pan">{t("panNumber")}</Label>
            <Input id="pb-pan" className="h-11" value={form.panNumber} onChange={(event) => update("panNumber", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pb-supplier-name">{t("supplierName")}</Label>
            <Input id="pb-supplier-name" className="h-11" value={form.supplierName} onChange={(event) => update("supplierName", event.target.value)} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pb-supplier-address">{t("supplierAddress")}</Label>
            <Input id="pb-supplier-address" className="h-11" value={form.supplierAddress} onChange={(event) => update("supplierAddress", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("status")}</Label>
            <CreatableSelect
              id="pb-status"
              options={["draft", "completed"].map((status) => ({ value: status, label: t(status) }))}
              value={form.status}
              onChange={(value) => update("status", value)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-background">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">{t("lineItems")}</h3>
          <Button type="button" size="sm" variant="outline" onClick={addLine}>
            <Plus className="h-3.5 w-3.5" />
            {t("addLine")}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <th className="w-64 px-3 py-2 text-left">{t("item")}</th>
                <th className="w-44 px-3 py-2 text-left">{t("variant")}</th>
                <th className="w-24 px-3 py-2 text-left">{t("unit")}</th>
                <th className="w-24 px-3 py-2 text-left">{t("quantity")}</th>
                <th className="w-28 px-3 py-2 text-left">{t("rate")}</th>
                <th className="w-28 px-3 py-2 text-left">{t("discount")}</th>
                <th className="w-28 px-3 py-2 text-right">{t("lineTotal")}</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.key} className="border-b last:border-b-0">
                  <td className="p-2">
                    <CreatableSelect options={itemOptions} value={line.itemId} onChange={(value) => updateLine(line.key, "itemId", value)} placeholder={t("selectItem")} />
                  </td>
                  <td className="p-2">
                    <CreatableSelect options={variantOptions} value={line.variantId} onChange={(value) => updateLine(line.key, "variantId", value)} placeholder={t("noVariant")} />
                  </td>
                  <td className="p-2">
                    <CreatableSelect options={unitOptionsForLine(line)} value={line.unitId} onChange={(value) => updateLine(line.key, "unitId", value)} placeholder={t("unit")} />
                  </td>
                  <td className="p-2">
                    <Input type="number" min="0" className="h-11" value={line.quantity} onChange={(event) => updateLine(line.key, "quantity", event.target.value)} />
                  </td>
                  <td className="p-2">
                    <Input type="number" min="0" step="0.01" className="h-11" value={line.rate} onChange={(event) => updateLine(line.key, "rate", event.target.value)} />
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Input type="number" min="0" step="0.01" className="h-11" value={line.discValue} onChange={(event) => updateLine(line.key, "discValue", event.target.value)} />
                      <select
                        className="h-11 rounded-xl border bg-muted/60 px-1 text-xs"
                        value={line.discType}
                        onChange={(event) => updateLine(line.key, "discType", event.target.value)}
                      >
                        <option value="percent">%</option>
                        <option value="amount">Rs</option>
                      </select>
                    </div>
                  </td>
                  <td className="p-2 text-right tabular-nums">{formatAmount(computedLines[index]?.lineTotal)}</td>
                  <td className="p-2 text-right">
                    <button type="button" onClick={() => removeLine(line.key)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {fieldErrors.lines?.[0] && <p className="px-4 py-2 text-xs text-destructive">{t(fieldErrors.lines[0])}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="space-y-1.5">
            <Label htmlFor="pb-notes">{t("notes")}</Label>
            <textarea
              id="pb-notes"
              rows={3}
              className="w-full rounded-xl border border-transparent bg-muted/60 p-3 text-sm outline-none hover:bg-muted focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50"
              value={form.notes}
              onChange={(event) => update("notes", event.target.value)}
            />
          </div>

          <div className="space-y-3 rounded-2xl border bg-background p-4">
            <div className="flex items-center gap-2">
              <Checkbox id="pb-is-paid" checked={form.isPaid} onCheckedChange={(checked) => update("isPaid", checked === true)} />
              <Label htmlFor="pb-is-paid" className="cursor-pointer">
                {t("paidNow")}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">{t("paidNowHint")}</p>
            {form.isPaid && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="pb-bank-account">{t("bankAccount")}</Label>
                  <CreatableSelect id="pb-bank-account" options={bankAccountOptions} value={form.bankAccountId} onChange={(value) => update("bankAccountId", value)} placeholder={t("selectBankAccount")} />
                  {fieldErrors.bankAccountId?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.bankAccountId[0])}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pb-paid-amount">{t("paidAmount")}</Label>
                  <Input id="pb-paid-amount" type="number" min="0" step="0.01" className="h-11" value={form.paidAmount} onChange={(event) => update("paidAmount", event.target.value)} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border bg-background p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("subtotal")}</span>
            <span className="tabular-nums">{formatAmount(documentTotals.subtotal)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Input type="number" min="0" step="0.01" className="h-9" value={form.discValue} onChange={(event) => update("discValue", event.target.value)} />
            <select
              className="h-9 rounded-xl border bg-muted/60 px-2 text-xs"
              value={form.discType}
              onChange={(event) => update("discType", event.target.value)}
            >
              <option value="percent">%</option>
              <option value="amount">Rs</option>
            </select>
            <span className="ml-auto text-sm tabular-nums text-muted-foreground">-{formatAmount(documentTotals.discAmount)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <SegmentedControl
              className="h-9"
              options={[
                { value: false, label: t("noVat") },
                { value: true, label: t("vat") },
              ]}
              value={form.isVatApplicable}
              onChange={(value) => update("isVatApplicable", value)}
            />
            {form.isVatApplicable && (
              <Input type="number" min="0" step="0.01" className="h-9 w-20" value={form.vatPercent} onChange={(event) => update("vatPercent", event.target.value)} />
            )}
            <span className="ml-auto tabular-nums text-muted-foreground">{formatAmount(documentTotals.vatAmount)}</span>
          </div>
          <div className="flex items-center justify-between border-t pt-3 text-base font-semibold">
            <span>{t("totalAmount")}</span>
            <span className="tabular-nums">{formatAmount(documentTotals.totalAmount)}</span>
          </div>
          {form.isPaid && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{t("dueAmount")}</span>
              <span className="tabular-nums">{formatAmount(Math.max(0, documentTotals.totalAmount - (Number(form.paidAmount) || 0)))}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
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
