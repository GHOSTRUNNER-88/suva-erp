"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Ban, Check, Eye, Loader2, Plus, Receipt, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { DualDateField } from "@/components/dual-date-field";
import { calcDocumentTotals, calcLineTotal, round2 } from "@/lib/money";
import { notify } from "@/lib/toast";
import { cn, decimalToInputValue } from "@/lib/utils";
import { cancelSalesInvoiceAction, createSalesInvoiceAction, updateSalesInvoiceAction } from "./actions";

export function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-CA").format(new Date(value));
}

export function InvoiceStatusBadge({ status }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium",
        status === "cancelled"
          ? "bg-destructive/10 text-destructive"
          : status === "draft"
            ? "bg-muted text-muted-foreground"
            : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      )}
    >
      {t(status === "cancelled" ? "cancelled" : status === "draft" ? "draft" : "completed")}
    </span>
  );
}

function createEmptyLine() {
  return {
    localId: `new-${Math.random().toString(36).slice(2)}`,
    itemId: "",
    variantId: "",
    unitId: "",
    quantity: "1",
    rate: "0",
    discType: "percent",
    discValue: "0",
  };
}

function linesToFormValues(lines) {
  return lines.map((line) => ({
    localId: `line-${line.id}`,
    itemId: String(line.itemId),
    variantId: line.variantId ? String(line.variantId) : "",
    unitId: String(line.unitId),
    quantity: decimalToInputValue(line.quantity),
    rate: decimalToInputValue(line.rate),
    discType: line.discType,
    discValue: decimalToInputValue(line.discType === "percent" ? line.discPercent : line.discAmount),
  }));
}

function toFormValues(invoice, defaults) {
  if (!invoice) {
    return {
      invoiceDate: "",
      partyId: "",
      billingName: "",
      billingAddress: "",
      panNumber: "",
      warehouseId: "",
      bankAccountId: "",
      discType: "percent",
      discValue: "0",
      isVatApplicable: defaults.vatEnabled,
      vatPercent: String(defaults.vatPercent),
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
    bankAccountId: invoice.bankAccountId ? String(invoice.bankAccountId) : "",
    discType: invoice.discType,
    discValue: decimalToInputValue(invoice.discType === "percent" ? invoice.discPercent : invoice.discAmount),
    isVatApplicable: invoice.isVatApplicable === 1,
    vatPercent: decimalToInputValue(invoice.vatPercent ?? defaults.vatPercent),
    isReceived: invoice.isReceived === 1,
    receivedAmount: decimalToInputValue(invoice.receivedAmount),
    notes: invoice.notes ?? "",
  };
}

/**
 * List/create shell for Sales Invoices — same page -> {Module}View shape as
 * every other module, plus the master-list + detail-page pattern from
 * bank-accounts (row click -> full invoice page with its own line items,
 * totals, and Edit/Cancel actions — see [invoice]/invoice-detail-view.jsx).
 * Editing lives on the detail page, not here: an edit needs the invoice's
 * full line items, which this list view never loads (only summary columns),
 * so `InvoiceForm` below is exported and reused there once that page has
 * already fetched the full detail — same cross-file reuse shape as
 * bank-accounts-view.jsx's BankAccountForm/TransferForm.
 */
export default function SalesInvoicesView({
  companySlug,
  initialInvoices,
  parties,
  items,
  warehouses,
  bankAccounts,
  defaults,
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [, startCancelTransition] = useTransition();

  function openCreate() {
    setSheetOpen(true);
  }

  function openDetail(invoice) {
    router.push(`/${companySlug}/sales/invoices/${invoice.id}`);
  }

  function handleCancel(invoice) {
    if (!window.confirm(t("confirmCancelSalesInvoice", { number: invoice.invoiceNumber }))) return;
    setCancellingId(invoice.id);
    startCancelTransition(async () => {
      const result = await cancelSalesInvoiceAction(companySlug, invoice.id);
      setCancellingId(null);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t(result.message));
      router.refresh();
    });
  }

  const columns = [
    {
      key: "invoiceNumber",
      header: t("invoiceNumber"),
      sortable: true,
      render: (invoice) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <Receipt className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{invoice.invoiceNumber}</p>
            <p className="truncate text-xs text-muted-foreground">{invoice.partyName}</p>
          </div>
        </div>
      ),
    },
    {
      key: "invoiceDate",
      header: t("invoiceDate"),
      sortable: true,
      render: (invoice) => <span className="text-sm text-muted-foreground">{formatDate(invoice.invoiceDate)}</span>,
    },
    {
      key: "totalAmount",
      header: t("totalAmount"),
      sortable: true,
      className: "flex-none w-36 justify-end text-right",
      render: (invoice) => <span className="font-medium tabular-nums">NPR {formatAmount(invoice.totalAmount)}</span>,
    },
    {
      key: "dueAmount",
      header: t("dueAmount"),
      className: "flex-none w-32 justify-end text-right",
      render: (invoice) =>
        invoice.status === "cancelled" ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : Number(invoice.dueAmount) > 0 ? (
          <span className="tabular-nums text-amber-700 dark:text-amber-500">NPR {formatAmount(invoice.dueAmount)}</span>
        ) : (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">{t("paidInFull")}</span>
        ),
    },
    {
      key: "status",
      header: t("status"),
      className: "flex-none w-28",
      render: (invoice) => <InvoiceStatusBadge status={invoice.status} />,
    },
  ];

  const rowActions = (invoice) => [
    { key: "view", label: t("view"), icon: Eye, onClick: () => openDetail(invoice) },
    {
      key: "cancel",
      label: t("cancel"),
      icon: Ban,
      variant: "destructive",
      disabled: invoice.status === "cancelled" || cancellingId === invoice.id,
      onClick: () => handleCancel(invoice),
    },
  ];

  return (
    <>
      <div className="flex justify-end">
        <Button type="button" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t("addSalesInvoice")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialInvoices}
          selectable={false}
          onRowClick={openDetail}
          rowActions={rowActions}
          filters={[
            {
              key: "status",
              label: t("status"),
              options: [
                { value: "completed", label: t("completed") },
                { value: "cancelled", label: t("cancelled") },
              ],
            },
          ]}
          emptyIcon={Receipt}
          emptyMessage={t("noSalesInvoicesYet")}
          emptyAction={{ label: t("addSalesInvoice"), onClick: openCreate }}
        />
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t("addSalesInvoice")}>
        <InvoiceForm
          companySlug={companySlug}
          invoice={null}
          lines={[]}
          parties={parties}
          items={items}
          warehouses={warehouses}
          bankAccounts={bankAccounts}
          defaults={defaults}
          onDone={(message, warning) => {
            setSheetOpen(false);
            notify.success(t(message));
            if (warning) notify.info(t(warning));
            router.refresh();
          }}
          onClose={() => setSheetOpen(false)}
        />
      </Sheet>
    </>
  );
}

export function InvoiceForm({
  companySlug,
  invoice,
  lines: initialLines,
  parties,
  items,
  warehouses,
  bankAccounts,
  defaults,
  onDone,
  onClose,
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => toFormValues(invoice, defaults));
  const [lines, setLines] = useState(() => (initialLines?.length ? linesToFormValues(initialLines) : [createEmptyLine()]));
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const partiesById = useMemo(() => new Map(parties.map((party) => [party.id, party])), [parties]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateLine(localId, patch) {
    setLines((current) => current.map((line) => (line.localId === localId ? { ...line, ...patch } : line)));
  }

  function handlePartyChange(partyId) {
    const party = partiesById.get(Number(partyId));
    setForm((current) => ({
      ...current,
      partyId,
      billingName: current.billingName || party?.name || "",
      billingAddress: current.billingAddress || party?.address || "",
      panNumber: current.panNumber || party?.panNumber || "",
    }));
  }

  function handleItemChange(localId, itemId) {
    const item = itemsById.get(Number(itemId));
    if (!item) {
      updateLine(localId, { itemId });
      return;
    }
    const party = partiesById.get(Number(form.partyId));
    const override = party?.partyGroupId ? item.groupPrices.find((p) => p.partyGroupId === party.partyGroupId) : null;
    updateLine(localId, {
      itemId,
      unitId: String(item.primaryUnitId),
      variantId: "",
      rate: decimalToInputValue(override ? override.sellingPrice : item.sellingPrice),
    });
  }

  function addLine() {
    setLines((current) => [...current, createEmptyLine()]);
  }

  function removeLine(localId) {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.localId !== localId) : current));
  }

  const computedLines = lines.map((line) => {
    const item = itemsById.get(Number(line.itemId));
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
    const result = invoice
      ? await updateSalesInvoiceAction(companySlug, invoice.id, payload)
      : await createSalesInvoiceAction(companySlug, payload);
    setPending(false);
    if (!result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onDone(result.message, result.warning);
  }

  const partyOptions = parties.map((party) => ({ value: String(party.id), label: party.name }));
  const itemOptions = items.map((item) => ({ value: String(item.id), label: `${item.name} (${item.primaryUnitCode})` }));
  const warehouseOptions = warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name }));
  const bankAccountOptions = bankAccounts.map((account) => ({
    value: String(account.id),
    label: account.displayName ? `${account.bankName} — ${account.displayName}` : account.bankName,
  }));

  return (
    <div className="space-y-5">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      {fieldErrors.lines?.[0] && (
        <Alert variant="destructive">
          <AlertDescription>{t(fieldErrors.lines[0])}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="invoice-party">{t("party")}</Label>
          <CreatableSelect
            id="invoice-party"
            options={partyOptions}
            value={form.partyId}
            onChange={handlePartyChange}
            placeholder={t("selectParty")}
          />
          {fieldErrors.partyId?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.partyId[0])}</p>}
        </div>
        <DualDateField
          id="invoice-date"
          label={t("invoiceDate")}
          value={form.invoiceDate}
          onChange={(value) => update("invoiceDate", value)}
          required
        />
      </div>
      {fieldErrors.invoiceDate?.[0] && <p className="-mt-3 text-xs text-destructive">{t(fieldErrors.invoiceDate[0])}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="invoice-warehouse">{t("warehouse")}</Label>
          <CreatableSelect
            id="invoice-warehouse"
            options={warehouseOptions}
            value={form.warehouseId}
            onChange={(value) => update("warehouseId", value)}
            placeholder={t("selectWarehouse")}
          />
          {fieldErrors.warehouseId?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.warehouseId[0])}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invoice-pan">{t("panNumber")}</Label>
          <Input id="invoice-pan" className="h-11" value={form.panNumber} onChange={(event) => update("panNumber", event.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invoice-billing-name">{t("billingName")}</Label>
        <Input
          id="invoice-billing-name"
          className="h-11"
          value={form.billingName}
          onChange={(event) => update("billingName", event.target.value)}
          placeholder={t("billingNameHint")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invoice-billing-address">{t("billingAddress")}</Label>
        <Input
          id="invoice-billing-address"
          className="h-11"
          value={form.billingAddress}
          onChange={(event) => update("billingAddress", event.target.value)}
        />
      </div>

      {/* Line items */}
      <div className="space-y-2 border-t pt-4">
        <div className="flex items-center justify-between">
          <Label>{t("lineItems")}</Label>
          <Button type="button" size="sm" variant="outline" onClick={addLine}>
            <Plus className="h-3.5 w-3.5" />
            {t("addLine")}
          </Button>
        </div>

        <div className="space-y-3">
          {computedLines.map((line) => (
            <div key={line.localId} className="space-y-2 rounded-xl border bg-muted/30 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <CreatableSelect
                    options={itemOptions}
                    value={line.itemId}
                    onChange={(value) => handleItemChange(line.localId, value)}
                    placeholder={t("selectItem")}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={lines.length === 1}
                  onClick={() => removeLine(line.localId)}
                  aria-label={t("removeLine")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {line.item?.variants?.length > 0 && (
                <CreatableSelect
                  options={line.item.variants.map((variant) => ({ value: String(variant.id), label: variant.name }))}
                  value={line.variantId}
                  onChange={(value) => updateLine(line.localId, { variantId: value })}
                  placeholder={t("noVariant")}
                  emptyLabel={t("noVariant")}
                />
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("quantity")}</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    className="h-9"
                    value={line.quantity}
                    onChange={(event) => updateLine(line.localId, { quantity: event.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("rate")}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.00001"
                    className="h-9"
                    value={line.rate}
                    onChange={(event) => updateLine(line.localId, { rate: event.target.value })}
                  />
                </div>
              </div>

              {line.item?.secondaryUnitId && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("unit")}</Label>
                  <SegmentedControl
                    className="h-9"
                    options={[
                      { value: String(line.item.primaryUnitId), label: line.item.primaryUnitCode },
                      { value: String(line.item.secondaryUnitId), label: line.item.secondaryUnitCode },
                    ]}
                    value={line.unitId}
                    onChange={(value) => updateLine(line.localId, { unitId: value })}
                  />
                </div>
              )}

              <div className="grid grid-cols-[auto_1fr] gap-2">
                <SegmentedControl
                  className="h-9 w-24"
                  options={[
                    { value: "percent", label: "%" },
                    { value: "amount", label: t("flatAmount") },
                  ]}
                  value={line.discType}
                  onChange={(value) => updateLine(line.localId, { discType: value })}
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="h-9"
                  value={line.discValue}
                  onChange={(event) => updateLine(line.localId, { discValue: event.target.value })}
                  placeholder={t("lineDiscount")}
                />
              </div>

              <p className="text-right text-sm font-medium tabular-nums">
                {t("lineTotal")}: NPR {formatAmount(line.lineTotal)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Discount / VAT */}
      <div className="grid grid-cols-[auto_1fr] gap-2 border-t pt-4">
        <div className="space-y-1.5">
          <Label>{t("discount")}</Label>
          <SegmentedControl
            className="w-24"
            options={[
              { value: "percent", label: "%" },
              { value: "amount", label: t("flatAmount") },
            ]}
            value={form.discType}
            onChange={(value) => update("discType", value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invoice-disc-value">&nbsp;</Label>
          <Input
            id="invoice-disc-value"
            type="number"
            min="0"
            step="0.01"
            className="h-11"
            value={form.discValue}
            onChange={(event) => update("discValue", event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2 rounded-xl bg-muted/60 p-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="invoice-vat"
            checked={form.isVatApplicable}
            onCheckedChange={(checked) => update("isVatApplicable", checked === true)}
          />
          <Label htmlFor="invoice-vat" className="cursor-pointer">
            {t("isVatApplicable")}
          </Label>
        </div>
        {form.isVatApplicable && (
          <div className="space-y-1.5 pt-1">
            <Label htmlFor="invoice-vat-percent">{t("vatPercent")}</Label>
            <Input
              id="invoice-vat-percent"
              type="number"
              min="0"
              max="100"
              step="0.01"
              className="h-11"
              value={form.vatPercent}
              onChange={(event) => update("vatPercent", event.target.value)}
            />
          </div>
        )}
      </div>

      {/* Receipt */}
      <div className="space-y-2 rounded-xl bg-muted/60 p-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="invoice-received"
            checked={form.isReceived}
            onCheckedChange={(checked) => update("isReceived", checked === true)}
          />
          <Label htmlFor="invoice-received" className="cursor-pointer">
            {t("isReceived")}
          </Label>
        </div>
        {form.isReceived && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-received-amount">{t("receivedAmount")}</Label>
              <Input
                id="invoice-received-amount"
                type="number"
                min="0"
                step="0.01"
                className="h-11"
                value={form.receivedAmount}
                onChange={(event) => update("receivedAmount", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-bank-account">{t("bankAccount")}</Label>
              <CreatableSelect
                id="invoice-bank-account"
                options={bankAccountOptions}
                value={form.bankAccountId}
                onChange={(value) => update("bankAccountId", value)}
                placeholder={t("notSet")}
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invoice-notes">{t("notes")}</Label>
        <Input id="invoice-notes" className="h-11" value={form.notes} onChange={(event) => update("notes", event.target.value)} />
      </div>

      {/* Totals summary */}
      <div className="space-y-1.5 rounded-xl border bg-background p-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>{t("subtotal")}</span>
          <span className="tabular-nums">NPR {formatAmount(documentTotals.subtotal)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>{t("discount")}</span>
          <span className="tabular-nums">− NPR {formatAmount(documentTotals.discAmount)}</span>
        </div>
        {form.isVatApplicable && (
          <div className="flex justify-between text-muted-foreground">
            <span>{t("vat")}</span>
            <span className="tabular-nums">+ NPR {formatAmount(documentTotals.vatAmount)}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-1.5 text-base font-semibold">
          <span>{t("totalAmount")}</span>
          <span className="tabular-nums">NPR {formatAmount(documentTotals.totalAmount)}</span>
        </div>
        {form.isReceived && (
          <>
            <div className="flex justify-between text-muted-foreground">
              <span>{t("receivedAmount")}</span>
              <span className="tabular-nums">NPR {formatAmount(form.receivedAmount)}</span>
            </div>
            <div className="flex justify-between font-medium text-amber-700 dark:text-amber-500">
              <span>{t("dueAmount")}</span>
              <span className="tabular-nums">NPR {formatAmount(dueAmount)}</span>
            </div>
          </>
        )}
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
