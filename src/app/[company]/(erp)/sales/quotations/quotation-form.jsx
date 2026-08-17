"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DualDateField } from "@/components/dual-date-field";
import { notify } from "@/lib/toast";
import { calcDocumentTotals, calcLineTotal } from "@/lib/money";
import { createSalesQuotationAction, updateSalesQuotationAction } from "./actions";

const QUOTATION_STATUSES = ["draft", "sent", "accepted", "converted", "expired", "cancelled"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function emptyLine(key) {
  return { key, itemId: "", variantId: "", unitId: "", quantity: "1", rate: "0", discType: "percent", discValue: "0" };
}

function linesFromExisting(lines, nextKey) {
  return lines.map((line) => ({
    key: nextKey(),
    itemId: String(line.itemId),
    variantId: line.variantId ? String(line.variantId) : "",
    unitId: String(line.unitId),
    quantity: String(line.quantity),
    rate: String(Number(line.rate)),
    discType: line.discType,
    discValue: String(Number(line.discType === "percent" ? line.discPercent : line.discAmount)),
  }));
}

function linesFromInitialValues(initialLines, nextKey) {
  return initialLines.map((line) => ({
    key: nextKey(),
    itemId: line.itemId ? String(line.itemId) : "",
    variantId: line.variantId ? String(line.variantId) : "",
    unitId: line.unitId ? String(line.unitId) : "",
    quantity: line.quantity ? String(line.quantity) : "1",
    rate: line.rate != null ? String(line.rate) : "0",
    discType: line.discType ?? "percent",
    discValue: line.discValue != null ? String(line.discValue) : "0",
  }));
}

/**
 * Shared create/edit form for Sales Quotations — same full-page shape as
 * ../orders/order-form.jsx (a document with line items needs real room, not
 * a Sheet), plus the `validUntil` date. `initialValues` is the pre-fill data
 * for a brand-new quotation created standalone; quotations don't themselves
 * get created "from" anything else in this app.
 */
export default function SalesQuotationForm({ companySlug, formData, quotation, lines, initialValues }) {
  const { t } = useTranslation();
  const router = useRouter();
  // Not a ref+counter: React flags reading a ref during render, and this
  // needs to run inside the lazy useState initializer below (which IS
  // render). A plain random id has no such restriction.
  function nextRowKey() {
    return `line-${crypto.randomUUID()}`;
  }

  const [form, setForm] = useState(() =>
    quotation
      ? {
          quotationNumber: quotation.quotationNumber,
          quotationDate: quotation.quotationDate,
          validUntil: quotation.validUntil ?? "",
          partyId: String(quotation.partyId),
          billingName: quotation.billingName ?? "",
          billingAddress: quotation.billingAddress ?? "",
          panNumber: quotation.panNumber ?? "",
          warehouseId: quotation.warehouseId ? String(quotation.warehouseId) : "",
          discType: quotation.discType,
          discValue: String(Number(quotation.discType === "percent" ? quotation.discPercent : quotation.discAmount)),
          isVatApplicable: quotation.isVatApplicable === 1,
          vatPercent: String(Number(quotation.vatPercent ?? formData.defaultVatPercent)),
          notes: quotation.notes ?? "",
          status: quotation.status,
        }
      : {
          quotationNumber: formData.suggestedQuotationNumber,
          quotationDate: today(),
          validUntil: "",
          partyId: initialValues?.partyId ? String(initialValues.partyId) : "",
          billingName: initialValues?.billingName ?? "",
          billingAddress: initialValues?.billingAddress ?? "",
          panNumber: initialValues?.panNumber ?? "",
          warehouseId: initialValues?.warehouseId ? String(initialValues.warehouseId) : "",
          discType: "percent",
          discValue: "0",
          isVatApplicable: formData.defaultVatEnabled,
          vatPercent: String(formData.defaultVatPercent),
          notes: initialValues?.notes ?? "",
          status: "sent",
        }
  );
  const [lineRows, setLineRows] = useState(() =>
    quotation
      ? linesFromExisting(lines, nextRowKey)
      : initialValues?.lines?.length
        ? linesFromInitialValues(initialValues.lines, nextRowKey)
        : [emptyLine(nextRowKey())]
  );
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handlePartyChange(partyId) {
    const party = formData.parties.find((candidate) => String(candidate.id) === partyId);
    setForm((current) => ({
      ...current,
      partyId,
      billingName: current.billingName || party?.name || "",
      billingAddress: current.billingAddress || party?.address || "",
      panNumber: current.panNumber || party?.panNumber || "",
    }));
  }

  function addLine() {
    setLineRows((current) => [...current, emptyLine(nextRowKey())]);
  }

  function updateLine(key, field, value) {
    setLineRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        if (field !== "itemId") return { ...row, [field]: value };
        const item = formData.items.find((candidate) => String(candidate.id) === value);
        return {
          ...row,
          itemId: value,
          unitId: item ? String(item.primaryUnitId) : row.unitId,
          rate: item ? String(Number(item.sellingPrice)) : row.rate,
        };
      })
    );
  }

  function removeLine(key) {
    setLineRows((current) => current.filter((row) => row.key !== key));
  }

  function unitOptionsForRow(row) {
    const item = formData.items.find((candidate) => String(candidate.id) === row.itemId);
    if (!item) return formData.units.map((unit) => ({ value: String(unit.id), label: unit.code }));
    const options = [{ value: String(item.primaryUnitId), label: item.primaryUnitCode }];
    if (item.secondaryUnitId) options.push({ value: String(item.secondaryUnitId), label: item.secondaryUnitCode });
    return options;
  }

  const itemOptions = formData.items.map((item) => ({ value: String(item.id), label: item.name }));
  const variantOptions = [
    { value: "", label: t("none") },
    ...formData.attributeValues.map((value) => ({ value: String(value.id), label: `${value.attributeName}: ${value.name}` })),
  ];
  const partyOptions = formData.parties.map((party) => ({ value: String(party.id), label: party.name }));
  const warehouseOptions = [
    { value: "", label: t("none") },
    ...formData.warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name })),
  ];

  const computedLines = lineRows.map((row) => {
    const quantity = Math.round(Number(row.quantity) || 0);
    return { ...row, quantity, ...calcLineTotal({ quantity, rate: row.rate, discType: row.discType, discValue: row.discValue }) };
  });
  const documentTotals = calcDocumentTotals({
    lines: computedLines,
    discType: form.discType,
    discValue: form.discValue,
    vatPercent: form.vatPercent,
    isVatApplicable: form.isVatApplicable,
  });

  function buildPayload() {
    return {
      ...form,
      // Optional numeric fields must reach the server as null, never "" —
      // z.coerce.number() would turn "" into 0, which then fails the
      // schema's .positive() check (see actions.js's lineSchema/quotationSchema).
      warehouseId: form.warehouseId || null,
      lines: lineRows.map((row) => ({
        itemId: row.itemId,
        variantId: row.variantId || null,
        unitId: row.unitId,
        quantity: row.quantity,
        rate: row.rate,
        discType: row.discType,
        discValue: row.discValue,
      })),
    };
  }

  function submit() {
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    startSubmit();
  }

  async function startSubmit() {
    const payload = buildPayload();
    const result = quotation
      ? await updateSalesQuotationAction(companySlug, quotation.id, payload)
      : await createSalesQuotationAction(companySlug, payload);
    setPending(false);
    if (!result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    notify.success(t(result.message));
    if (quotation) {
      router.refresh();
    } else {
      router.push(`/${companySlug}/sales/quotations/${result.id}`);
    }
  }

  return (
    <div className="space-y-5">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border p-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="quotation-number">{t("quotationNumber")}</Label>
            <Input
              id="quotation-number"
              className="h-11"
              value={form.quotationNumber}
              onChange={(event) => update("quotationNumber", event.target.value)}
            />
            {fieldErrors.quotationNumber?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.quotationNumber[0])}</p>}
          </div>
          <DualDateField id="quotation-date" label={t("quotationDate")} value={form.quotationDate} onChange={(value) => update("quotationDate", value)} required />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DualDateField id="quotation-valid-until" label={t("validUntil")} value={form.validUntil} onChange={(value) => update("validUntil", value)} />
          <div className="space-y-1.5">
            <Label htmlFor="quotation-warehouse">{t("warehouse")}</Label>
            <CreatableSelect id="quotation-warehouse" options={warehouseOptions} value={form.warehouseId} onChange={(value) => update("warehouseId", value)} placeholder={t("none")} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quotation-party">{t("party")}</Label>
          <CreatableSelect id="quotation-party" options={partyOptions} value={form.partyId} onChange={handlePartyChange} placeholder={t("selectParty")} />
          {fieldErrors.partyId?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.partyId[0])}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="quotation-billing-name">{t("billingName")}</Label>
            <Input id="quotation-billing-name" className="h-11" value={form.billingName} onChange={(event) => update("billingName", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quotation-pan">{t("panNumber")}</Label>
            <Input id="quotation-pan" className="h-11" value={form.panNumber} onChange={(event) => update("panNumber", event.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quotation-billing-address">{t("billingAddress")}</Label>
          <Input id="quotation-billing-address" className="h-11" value={form.billingAddress} onChange={(event) => update("billingAddress", event.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>{t("status")}</Label>
          <SegmentedControl wrap options={QUOTATION_STATUSES.map((status) => ({ value: status, label: t(status) }))} value={form.status} onChange={(value) => update("status", value)} />
        </div>
      </div>

      <LineItemsEditor
        t={t}
        lineRows={lineRows}
        computedLines={computedLines}
        itemOptions={itemOptions}
        variantOptions={variantOptions}
        unitOptionsForRow={unitOptionsForRow}
        updateLine={updateLine}
        removeLine={removeLine}
        addLine={addLine}
        addDisabled={formData.items.length === 0}
        fieldErrors={fieldErrors}
      />

      <div className="rounded-xl border p-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("headerDiscount")}</Label>
            <div className="flex h-11 items-center gap-2">
              <SegmentedControl
                className="w-28"
                options={[
                  { value: "percent", label: "%" },
                  { value: "amount", label: t("amountAbbrev") },
                ]}
                value={form.discType}
                onChange={(value) => update("discType", value)}
              />
              <Input type="number" className="h-11 flex-1" value={form.discValue} onChange={(event) => update("discValue", event.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("vat")}</Label>
            <div className="flex h-11 items-center gap-2">
              <SegmentedControl
                className="w-28"
                options={[
                  { value: true, label: t("yes") },
                  { value: false, label: t("no") },
                ]}
                value={form.isVatApplicable}
                onChange={(value) => update("isVatApplicable", value)}
              />
              {form.isVatApplicable && (
                <Input type="number" className="h-11 flex-1" value={form.vatPercent} onChange={(event) => update("vatPercent", event.target.value)} />
              )}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quotation-notes">{t("notes")}</Label>
          <textarea
            id="quotation-notes"
            rows={3}
            value={form.notes}
            onChange={(event) => update("notes", event.target.value)}
            className="w-full min-w-0 rounded-xl border border-transparent bg-muted/60 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:bg-muted focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <div className="space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>{t("subtotal")}</span>
            <span className="tabular-nums">{formatAmount(documentTotals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{t("discount")}</span>
            <span className="tabular-nums">-{formatAmount(documentTotals.discAmount)}</span>
          </div>
          {form.isVatApplicable && (
            <div className="flex justify-between text-muted-foreground">
              <span>{t("vatAmount")}</span>
              <span className="tabular-nums">{formatAmount(documentTotals.vatAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold">
            <span>{t("totalAmount")}</span>
            <span className="tabular-nums">{formatAmount(documentTotals.totalAmount)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.push(`/${companySlug}/sales/quotations`)} disabled={pending}>
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

function LineItemsEditor({
  t,
  lineRows,
  computedLines,
  itemOptions,
  variantOptions,
  unitOptionsForRow,
  updateLine,
  removeLine,
  addLine,
  addDisabled,
  fieldErrors,
}) {
  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{t("lineItems")}</p>
        {fieldErrors.lines?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.lines[0])}</p>}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-215 space-y-2">
          <div className="grid grid-cols-[2fr_1.4fr_0.9fr_0.7fr_0.9fr_1fr_0.9fr_auto] gap-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <span>{t("item")}</span>
            <span>{t("variant")}</span>
            <span>{t("unit")}</span>
            <span>{t("quantity")}</span>
            <span>{t("rate")}</span>
            <span>{t("lineDiscount")}</span>
            <span className="text-right">{t("lineTotal")}</span>
            <span />
          </div>

          {lineRows.map((row, index) => (
            <div key={row.key} className="grid grid-cols-[2fr_1.4fr_0.9fr_0.7fr_0.9fr_1fr_0.9fr_auto] items-center gap-2">
              <CreatableSelect
                options={itemOptions}
                value={row.itemId}
                onChange={(value) => updateLine(row.key, "itemId", value)}
                placeholder={t("selectItem")}
              />
              <CreatableSelect
                options={variantOptions}
                value={row.variantId}
                onChange={(value) => updateLine(row.key, "variantId", value)}
                placeholder={t("none")}
              />
              <CreatableSelect
                options={unitOptionsForRow(row)}
                value={row.unitId}
                onChange={(value) => updateLine(row.key, "unitId", value)}
                placeholder={t("unit")}
              />
              <Input
                type="number"
                min="1"
                step="1"
                className="h-9"
                value={row.quantity}
                onChange={(event) => updateLine(row.key, "quantity", event.target.value)}
              />
              <Input type="number" className="h-9" value={row.rate} onChange={(event) => updateLine(row.key, "rate", event.target.value)} />
              <div className="flex h-9 items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateLine(row.key, "discType", row.discType === "percent" ? "amount" : "percent")}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted/60 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                >
                  {row.discType === "percent" ? "%" : t("amountAbbrev")}
                </button>
                <Input
                  type="number"
                  className="h-9"
                  value={row.discValue}
                  onChange={(event) => updateLine(row.key, "discValue", event.target.value)}
                />
              </div>
              <span className="text-right text-sm font-medium tabular-nums">{formatAmount(computedLines[index]?.lineTotal ?? 0)}</span>
              <button
                type="button"
                onClick={() => removeLine(row.key)}
                aria-label={t("delete")}
                disabled={lineRows.length === 1}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <Button type="button" size="sm" variant="outline" onClick={addLine} disabled={addDisabled}>
        <Plus className="h-3.5 w-3.5" />
        {t("addLine")}
      </Button>
      {addDisabled && <p className="text-xs text-muted-foreground">{t("addItemsFirstHint")}</p>}
    </div>
  );
}
