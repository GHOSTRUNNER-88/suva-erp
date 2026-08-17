"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CollapsibleDetails } from "@/components/ui/collapsible-details";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { Input } from "@/components/ui/input";
import { ItemQuickAddForm } from "@/components/ui/item-quick-add-form";
import { Label } from "@/components/ui/label";
import { LineItemsTable } from "@/components/ui/line-items-table";
import { Modal } from "@/components/ui/modal";
import { PartyQuickAddForm } from "@/components/ui/party-quick-add-form";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DualDateField } from "@/components/dual-date-field";
import { calcDocumentTotals, calcLineTotal, round2 } from "@/lib/money";
import { notify } from "@/lib/toast";
import { decimalToInputValue } from "@/lib/utils";
import { createSalesInvoiceAction, updateSalesInvoiceAction } from "./actions";

export function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nextLineKey() {
  return `line-${crypto.randomUUID()}`;
}

function emptyLine() {
  return { localId: nextLineKey(), itemId: "", variantId: "", unitId: "", quantity: "1", rate: "0", discType: "percent", discValue: "0" };
}

function linesToFormValues(lines) {
  return lines.map((line) => ({
    localId: nextLineKey(),
    itemId: String(line.itemId),
    variantId: line.variantId ? String(line.variantId) : "",
    unitId: String(line.unitId),
    quantity: decimalToInputValue(line.quantity),
    rate: decimalToInputValue(line.rate),
    discType: line.discType,
    discValue: line.discType === "percent" ? decimalToInputValue(line.discPercent) : decimalToInputValue(line.discAmount),
    discountOpen: Number(line.discAmount) > 0,
  }));
}

function toFormValues(invoice, defaults) {
  if (!invoice) {
    return {
      invoiceDate: new Date().toISOString().slice(0, 10),
      partyId: "",
      billingName: "",
      billingAddress: "",
      panNumber: "",
      warehouseId: "",
      referenceNo: "",
      bankAccountId: "",
      discType: "percent",
      discValue: "0",
      isVatApplicable: defaults.defaultVatEnabled,
      vatPercent: String(defaults.defaultVatPercent),
      isReceived: true,
      receivedAmount: "0",
      notes: "",
    };
  }
  return {
    invoiceDate: invoice.invoiceDate ?? "",
    partyId: String(invoice.partyId),
    billingName: invoice.billingName ?? "",
    billingAddress: invoice.billingAddress ?? "",
    panNumber: invoice.panNumber ?? "",
    warehouseId: invoice.warehouseId ? String(invoice.warehouseId) : "",
    referenceNo: invoice.referenceNo ?? "",
    bankAccountId: invoice.bankAccountId ? String(invoice.bankAccountId) : "",
    discType: invoice.discType,
    discValue: decimalToInputValue(invoice.discType === "percent" ? invoice.discPercent : invoice.discAmount),
    isVatApplicable: invoice.isVatApplicable === 1,
    vatPercent: decimalToInputValue(invoice.vatPercent ?? defaults.defaultVatPercent),
    isReceived: invoice.isReceived === 1,
    receivedAmount: decimalToInputValue(invoice.receivedAmount),
    notes: invoice.notes ?? "",
  };
}

/**
 * Minimal, spreadsheet-style invoice editor — party search up top, doc
 * number/date compact top-right, a real line-item table (not stacked
 * mobile-style cards), secondary fields (warehouse/billing/PAN) collapsed
 * behind "+ Add details", discount/VAT/receipt compact bottom-right. Lives
 * on its own full-width page (`new/page.js`, and inline-swapped on the
 * detail page for edit) rather than a narrow side Sheet — this layout needs
 * the width a Sheet doesn't have. Party and Item selects support inline
 * quick-add (see PartyQuickAddForm/ItemQuickAddForm) so creating an invoice
 * never has to detour to another page first.
 */
export default function InvoiceForm({ companySlug, mode, invoice, initialLines, formData }) {
  const { t } = useTranslation();
  const router = useRouter();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(() => toFormValues(invoice, formData));
  const [lines, setLines] = useState(() => (isEdit && initialLines?.length ? linesToFormValues(initialLines) : [emptyLine()]));
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [partyQuickAdd, setPartyQuickAdd] = useState(null);
  const [itemQuickAdd, setItemQuickAdd] = useState(null);
  const [parties, setParties] = useState(formData.parties);
  const [items, setItems] = useState(formData.items);

  const itemsById = useMemo(() => new Map(items.map((item) => [String(item.id), item])), [items]);
  const partiesById = useMemo(() => new Map(parties.map((party) => [String(party.id), party])), [parties]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function selectParty(partyId) {
    const party = partiesById.get(partyId);
    setForm((current) => ({
      ...current,
      partyId,
      billingName: party?.name ?? current.billingName,
      billingAddress: party?.address ?? current.billingAddress,
      panNumber: party?.panNumber || current.panNumber,
    }));
  }

  function updateLine(localId, patch) {
    setLines((current) => current.map((line) => (line.localId === localId ? { ...line, ...patch } : line)));
  }

  function selectLineItem(localId, itemId) {
    const item = itemsById.get(itemId);
    if (!item) {
      updateLine(localId, { itemId });
      return;
    }
    const party = partiesById.get(form.partyId);
    const override = party?.partyGroupId ? item.groupPrices?.find((p) => p.partyGroupId === party.partyGroupId) : null;
    updateLine(localId, {
      itemId,
      unitId: String(item.primaryUnitId),
      variantId: "",
      rate: decimalToInputValue(override ? override.sellingPrice : item.sellingPrice),
    });
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }

  function removeLine(localId) {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.localId !== localId) : current));
  }

  const computedLines = lines.map((line) => {
    const item = itemsById.get(line.itemId);
    const lineTotals = calcLineTotal({
      quantity: Math.round(Number(line.quantity) || 0),
      rate: Number(line.rate) || 0,
      discType: line.discType,
      discValue: Number(line.discValue) || 0,
    });
    return { ...line, item, ...lineTotals };
  });
  const documentTotals = calcDocumentTotals({
    lines: computedLines,
    discType: form.discType,
    discValue: Number(form.discValue) || 0,
    vatPercent: Number(form.vatPercent) || 0,
    isVatApplicable: form.isVatApplicable,
  });
  const dueAmount = form.isReceived
    ? round2(documentTotals.totalAmount - (Number(form.receivedAmount) || 0))
    : documentTotals.totalAmount;

  function submit() {
    const hasInvalidLine = lines.some((line) => !line.itemId || !line.unitId || !(Number(line.quantity) > 0));
    if (hasInvalidLine) {
      setFormError(t("invalidLineItems"));
      return;
    }
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
    const result = isEdit ? await updateSalesInvoiceAction(companySlug, invoice.id, payload) : await createSalesInvoiceAction(companySlug, payload);
    setPending(false);
    if (!result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
      return;
    }
    notify.success(t(result.message));
    if (result.warning) notify.info(t(result.warning));
    router.push(`/${companySlug}/sales/invoices/${isEdit ? invoice.id : result.id}`);
    router.refresh();
  }

  const partyOptions = parties.map((party) => ({ value: String(party.id), label: party.name }));
  const itemOptions = items.map((item) => ({ value: String(item.id), label: item.name }));
  const warehouseOptions = formData.warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name }));
  const bankAccountOptions = formData.bankAccounts.map((account) => ({
    value: String(account.id),
    label: account.displayName ? `${account.bankName} — ${account.displayName}` : account.bankName,
  }));

  return (
    <div className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      {/* Party search + doc number/date */}
      <div className="flex flex-col gap-4 rounded-2xl border bg-background p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="w-full max-w-sm space-y-1.5">
          <Label htmlFor="invoice-party">{t("customer")}</Label>
          <CreatableSelect
            id="invoice-party"
            options={partyOptions}
            value={form.partyId}
            onChange={selectParty}
            placeholder={t("selectCustomer")}
            createNewLabel={t("addParty")}
            onCreateNew={() => new Promise((resolve) => setPartyQuickAdd({ resolve }))}
          />
          {fieldErrors.partyId?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.partyId[0])}</p>}
        </div>
        <div className="grid w-full grid-cols-2 gap-4 sm:w-auto sm:grid-cols-1">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{t("invoiceNumber")}</p>
            <p className="text-sm font-medium">{isEdit ? invoice.invoiceNumber : t("creditNoteNumberHint")}</p>
          </div>
          <div className="text-right">
            <DualDateField id="invoice-date" label={t("invoiceDate")} value={form.invoiceDate} onChange={(value) => update("invoiceDate", value)} required />
          </div>
        </div>
      </div>
      {fieldErrors.invoiceDate?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.invoiceDate[0])}</p>}

      <LineItemsTable
        lines={computedLines}
        itemOptions={itemOptions}
        onItemChange={selectLineItem}
        onLineChange={updateLine}
        onAddLine={addLine}
        onRemoveLine={removeLine}
        formatAmount={formatAmount}
      />
      {fieldErrors.lines?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.lines[0])}</p>}

      <CollapsibleDetails label={t("moreDetails")} defaultOpen={Boolean(invoice?.warehouseId || invoice?.billingName || invoice?.referenceNo)}>
        <div className="space-y-1.5">
          <Label htmlFor="invoice-warehouse">{t("warehouse")}</Label>
          <CreatableSelect id="invoice-warehouse" options={warehouseOptions} value={form.warehouseId} onChange={(value) => update("warehouseId", value)} placeholder={t("selectWarehouse")} />
          {fieldErrors.warehouseId?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.warehouseId[0])}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invoice-pan">{t("panNumber")}</Label>
          <Input id="invoice-pan" className="h-11" value={form.panNumber} onChange={(event) => update("panNumber", event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invoice-billing-name">{t("billingName")}</Label>
          <Input id="invoice-billing-name" className="h-11" value={form.billingName} onChange={(event) => update("billingName", event.target.value)} placeholder={t("billingNameHint")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invoice-billing-address">{t("billingAddress")}</Label>
          <Input id="invoice-billing-address" className="h-11" value={form.billingAddress} onChange={(event) => update("billingAddress", event.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="invoice-notes">{t("notes")}</Label>
          <Input id="invoice-notes" className="h-11" value={form.notes} onChange={(event) => update("notes", event.target.value)} />
        </div>
      </CollapsibleDetails>

      <div className="ml-auto max-w-sm space-y-3 rounded-2xl border bg-background p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("subtotal")}</span>
          <span className="tabular-nums">{formatAmount(documentTotals.subtotal)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Label className="w-20 shrink-0 text-xs text-muted-foreground">{t("discount")}</Label>
          <Input type="number" min="0" step="0.01" className="h-9" value={form.discValue} onChange={(event) => update("discValue", event.target.value)} />
          <select className="h-9 rounded-lg border bg-muted/60 px-2 text-xs" value={form.discType} onChange={(event) => update("discType", event.target.value)}>
            <option value="percent">%</option>
            <option value="amount">Rs</option>
          </select>
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
        <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
          <span>{t("totalAmount")}</span>
          <span className="tabular-nums">{formatAmount(documentTotals.totalAmount)}</span>
        </div>

        <div className="flex items-center gap-2 border-t pt-3">
          <Checkbox id="invoice-received" checked={form.isReceived} onCheckedChange={(checked) => update("isReceived", checked === true)} />
          <Label htmlFor="invoice-received" className="cursor-pointer text-sm">
            {t("isReceived")}
          </Label>
        </div>
        {form.isReceived && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="w-20 shrink-0 text-xs text-muted-foreground">{t("receivedAmount")}</Label>
              <Input type="number" min="0" step="0.01" className="h-9" value={form.receivedAmount} onChange={(event) => update("receivedAmount", event.target.value)} />
            </div>
            <CreatableSelect options={bankAccountOptions} value={form.bankAccountId} onChange={(value) => update("bankAccountId", value)} placeholder={t("selectBankAccount")} />
            <div className="flex items-center justify-between text-sm font-medium text-amber-700 dark:text-amber-500">
              <span>{t("dueAmount")}</span>
              <span className="tabular-nums">{formatAmount(dueAmount)}</span>
            </div>
          </div>
        )}
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

      {partyQuickAdd && (
        <Modal open onClose={() => { partyQuickAdd.resolve(null); setPartyQuickAdd(null); }} title={t("addParty")}>
          <PartyQuickAddForm
            companySlug={companySlug}
            defaultType="Customer"
            onCancel={() => { partyQuickAdd.resolve(null); setPartyQuickAdd(null); }}
            onDone={(result) => {
              setParties((current) => [...current, { id: result.value, name: result.label, address: null, panNumber: null, partyGroupId: null }]);
              partyQuickAdd.resolve(result);
              setPartyQuickAdd(null);
            }}
          />
        </Modal>
      )}
      {itemQuickAdd && (
        <Modal open onClose={() => { itemQuickAdd.resolve(null); setItemQuickAdd(null); }} title={t("addItem")}>
          <ItemQuickAddForm
            companySlug={companySlug}
            units={formData.units}
            onCancel={() => { itemQuickAdd.resolve(null); setItemQuickAdd(null); }}
            onDone={(result) => {
              const unit = formData.units[0];
              setItems((current) => [
                ...current,
                { id: result.value, name: result.label, primaryUnitId: unit?.id, primaryUnitCode: unit?.code, secondaryUnitId: null, sellingPrice: "0", groupPrices: [], variants: [] },
              ]);
              itemQuickAdd.resolve(result);
              setItemQuickAdd(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
