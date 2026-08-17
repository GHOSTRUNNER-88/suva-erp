"use client";

import { useState } from "react";
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
import { createDeliveryChallanAction, updateDeliveryChallanAction } from "./actions";

const SOURCE_TYPES = ["manual", "sale", "purchase"];
const STATUSES = ["pending", "delivered"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyLine(key) {
  return { key, itemId: "", variantId: "", unitId: "", quantity: "1", itemNote: "" };
}

function linesFromExisting(lines, nextKey) {
  return lines.map((line) => ({
    key: nextKey(),
    itemId: String(line.itemId),
    variantId: line.variantId ? String(line.variantId) : "",
    unitId: line.unitId ? String(line.unitId) : "",
    quantity: String(line.quantity),
    itemNote: line.itemNote ?? "",
  }));
}

function linesFromInitialValues(initialLines, nextKey) {
  return initialLines.map((line) => ({
    key: nextKey(),
    itemId: line.itemId ? String(line.itemId) : "",
    variantId: line.variantId ? String(line.variantId) : "",
    unitId: line.unitId ? String(line.unitId) : "",
    quantity: line.quantity ? String(line.quantity) : "1",
    itemNote: line.itemNote ?? "",
  }));
}

/**
 * Shared create/edit form for Delivery Challans — same full-page shape as
 * the Sales Orders/Quotations forms, but no money at all (no rate/discount/
 * totals — see actions.js's file header). `challanNumber` is always
 * server-generated (shown read-only, never a form field). Once a challan's
 * stock has actually been deducted (`stockDeducted`), its warehouse/lines/
 * deductStock lock — see actions.js's updateDeliveryChallanAction for why;
 * this component mirrors that lock in the UI so it isn't just a silent
 * server-side no-op. A cancelled challan can no longer be saved at all
 * (server rejects it) — shown here as a banner rather than disabling every
 * field, since the server's rejection message is already clear.
 */
export default function DeliveryChallanForm({ companySlug, formData, challan, lines, initialValues }) {
  const { t } = useTranslation();
  const router = useRouter();
  // Not a ref+counter: React flags reading a ref during render, and this
  // needs to run inside the lazy useState initializer below (which IS
  // render). A plain random id has no such restriction.
  function nextRowKey() {
    return `line-${crypto.randomUUID()}`;
  }

  const locked = challan?.stockDeducted === 1;
  const cancelled = challan?.status === "cancelled";

  const [form, setForm] = useState(() =>
    challan
      ? {
          challanDate: challan.challanDate,
          partyId: String(challan.partyId),
          warehouseId: challan.warehouseId ? String(challan.warehouseId) : "",
          sourceType: challan.sourceType,
          sourceId: challan.sourceId ? String(challan.sourceId) : "",
          notes: challan.notes ?? "",
          status: challan.status === "cancelled" ? "pending" : challan.status,
          deductStock: challan.stockDeducted === 1,
        }
      : {
          challanDate: today(),
          partyId: initialValues?.partyId ? String(initialValues.partyId) : "",
          warehouseId: initialValues?.warehouseId ? String(initialValues.warehouseId) : "",
          sourceType: initialValues?.sourceType ?? "manual",
          sourceId: initialValues?.sourceId ? String(initialValues.sourceId) : "",
          notes: initialValues?.notes ?? "",
          status: "pending",
          // Matches the legacy default relationship: standalone (manual)
          // challans deduct stock by default, ones raised from an invoice/
          // bill default to NOT deducting (that document likely already
          // did) — always overridable either way.
          deductStock: (initialValues?.sourceType ?? "manual") === "manual",
        }
  );
  const [lineRows, setLineRows] = useState(() =>
    challan
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

  function addLine() {
    setLineRows((current) => [...current, emptyLine(nextRowKey())]);
  }

  function updateLine(key, field, value) {
    setLineRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        if (field !== "itemId") return { ...row, [field]: value };
        const item = formData.items.find((candidate) => String(candidate.id) === value);
        return { ...row, itemId: value, unitId: item ? String(item.primaryUnitId) : row.unitId };
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

  function buildPayload() {
    return {
      ...form,
      warehouseId: form.warehouseId || null,
      sourceId: form.sourceId || null,
      lines: lineRows.map((row) => ({
        itemId: row.itemId,
        variantId: row.variantId || null,
        unitId: row.unitId || null,
        quantity: row.quantity,
        itemNote: row.itemNote,
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
    const result = challan
      ? await updateDeliveryChallanAction(companySlug, challan.id, payload)
      : await createDeliveryChallanAction(companySlug, payload);
    setPending(false);
    if (!result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    notify.success(t(result.message));
    if (result.warning) notify.info(t(result.warning));
    if (challan) {
      router.refresh();
    } else {
      router.push(`/${companySlug}/sales/delivery-challans/${result.id}`);
    }
  }

  return (
    <div className="space-y-5">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      {cancelled && (
        <Alert variant="destructive">
          <AlertDescription>{t("challanCancelledHint")}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border p-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="challan-number">{t("challanNumber")}</Label>
            <Input id="challan-number" className="h-11" value={challan ? challan.challanNumber : t("challanNumberAutoHint")} disabled />
          </div>
          <DualDateField id="challan-date" label={t("challanDate")} value={form.challanDate} onChange={(value) => update("challanDate", value)} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="challan-party">{t("party")}</Label>
          <CreatableSelect id="challan-party" options={partyOptions} value={form.partyId} onChange={(value) => update("partyId", value)} placeholder={t("selectParty")} />
          {fieldErrors.partyId?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.partyId[0])}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="challan-warehouse">{t("warehouse")}</Label>
            <CreatableSelect
              id="challan-warehouse"
              options={warehouseOptions}
              value={form.warehouseId}
              onChange={(value) => update("warehouseId", value)}
              placeholder={t("none")}
              disabled={locked}
            />
            {locked && <p className="text-xs text-muted-foreground">{t("challanLockedHint")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>{t("status")}</Label>
            <SegmentedControl options={STATUSES.map((status) => ({ value: status, label: t(status) }))} value={form.status} onChange={(value) => update("status", value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("challanSource")}</Label>
            <SegmentedControl options={SOURCE_TYPES.map((type) => ({ value: type, label: t(`challanSource_${type}`) }))} value={form.sourceType} onChange={(value) => update("sourceType", value)} />
          </div>
          {form.sourceType !== "manual" && (
            <div className="space-y-1.5">
              <Label htmlFor="challan-source-id">{t("challanSourceId")}</Label>
              <Input id="challan-source-id" type="number" className="h-11" value={form.sourceId} onChange={(event) => update("sourceId", event.target.value)} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-muted/60 p-3">
          <Checkbox
            id="challan-deduct-stock"
            checked={form.deductStock}
            onCheckedChange={(checked) => update("deductStock", checked === true)}
            disabled={locked}
          />
          <div>
            <Label htmlFor="challan-deduct-stock" className="cursor-pointer">
              {t("deductStock")}
            </Label>
            <p className="text-xs text-muted-foreground">{t("deductStockHint")}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="challan-notes">{t("notes")}</Label>
          <textarea
            id="challan-notes"
            rows={3}
            value={form.notes}
            onChange={(event) => update("notes", event.target.value)}
            className="w-full min-w-0 rounded-xl border border-transparent bg-muted/60 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:bg-muted focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t("lineItems")}</p>
          {fieldErrors.lines?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.lines[0])}</p>}
        </div>
        {locked && <p className="text-xs text-muted-foreground">{t("challanLockedHint")}</p>}

        <div className="overflow-x-auto">
          <div className="min-w-175 space-y-2">
            <div className="grid grid-cols-[2fr_1.4fr_0.9fr_0.7fr_1.4fr_auto] gap-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <span>{t("item")}</span>
              <span>{t("variant")}</span>
              <span>{t("unit")}</span>
              <span>{t("quantity")}</span>
              <span>{t("lineNote")}</span>
              <span />
            </div>

            {lineRows.map((row) => (
              <div key={row.key} className="grid grid-cols-[2fr_1.4fr_0.9fr_0.7fr_1.4fr_auto] items-center gap-2">
                <CreatableSelect
                  options={itemOptions}
                  value={row.itemId}
                  onChange={(value) => updateLine(row.key, "itemId", value)}
                  placeholder={t("selectItem")}
                  disabled={locked}
                />
                <CreatableSelect
                  options={variantOptions}
                  value={row.variantId}
                  onChange={(value) => updateLine(row.key, "variantId", value)}
                  placeholder={t("none")}
                  disabled={locked}
                />
                <CreatableSelect
                  options={unitOptionsForRow(row)}
                  value={row.unitId}
                  onChange={(value) => updateLine(row.key, "unitId", value)}
                  placeholder={t("unit")}
                  disabled={locked}
                />
                <Input
                  type="number"
                  min="1"
                  step="1"
                  className="h-9"
                  value={row.quantity}
                  onChange={(event) => updateLine(row.key, "quantity", event.target.value)}
                  disabled={locked}
                />
                <Input
                  className="h-9"
                  value={row.itemNote}
                  onChange={(event) => updateLine(row.key, "itemNote", event.target.value)}
                  placeholder={t("optional")}
                  disabled={locked}
                />
                <button
                  type="button"
                  onClick={() => removeLine(row.key)}
                  aria-label={t("delete")}
                  disabled={locked || lineRows.length === 1}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <Button type="button" size="sm" variant="outline" onClick={addLine} disabled={locked || formData.items.length === 0}>
          <Plus className="h-3.5 w-3.5" />
          {t("addLine")}
        </Button>
        {formData.items.length === 0 && <p className="text-xs text-muted-foreground">{t("addItemsFirstHint")}</p>}
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.push(`/${companySlug}/sales/delivery-challans`)} disabled={pending}>
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
