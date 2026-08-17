"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { DataTable } from "@/components/ui/data-table";
import { CategoryIcon } from "@/components/ui/icon-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Sheet } from "@/components/ui/sheet";
import { notify } from "@/lib/toast";
import { cn, decimalToInputValue } from "@/lib/utils";
import { PartyGroupQuickAddForm } from "../parties/party-group-quick-add-form";
import { createUnitAction } from "../units/actions";
import { createAttributeAction, createAttributeValueAction, getItemAttributeValueIds } from "./attributes/actions";
import { CategoryQuickAddForm } from "./category-quick-add-form";
import { createItemAction, deleteItemsAction, getItemPartyGroupPrices, updateItemAction } from "./actions";

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toFormValues(item) {
  return {
    name: item.name ?? "",
    categoryId: item.categoryId ? String(item.categoryId) : "",
    barcodeInput: item.barcodeInput === 1,
    barcodeValue: item.barcodeValue ?? "",
    primaryUnitId: item.primaryUnitId ? String(item.primaryUnitId) : "",
    secondaryUnitId: item.secondaryUnitId ? String(item.secondaryUnitId) : "",
    conversionFactor: item.conversionFactor ? String(item.conversionFactor) : "",
    purchasePrice: decimalToInputValue(item.purchasePrice),
    sellingPrice: decimalToInputValue(item.sellingPrice),
  };
}

const EMPTY_FORM = {
  name: "",
  categoryId: "",
  barcodeInput: false,
  barcodeValue: "",
  primaryUnitId: "",
  secondaryUnitId: "",
  conversionFactor: "",
  purchasePrice: "0",
  sellingPrice: "0",
};

/**
 * Items list/create/edit shell — same page -> {Module}View -> {Module}Form
 * shape as Parties/Item Categories/Warehouses. Category, unit, and party
 * group pickers all use CreatableSelect's pinned "+ Add X" row
 * (onCreateNew — see components/ui/creatable-select.jsx) instead of the
 * type-to-create flow, since all three benefit from a real small form
 * (icon, code+type, description) rather than just a bare name.
 */
export default function ItemsView({ companySlug, initialItems, categories, units, partyGroups, attributes }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, startDeleteTransition] = useTransition();

  function openCreate() {
    setEditingItem(null);
    setSheetOpen(true);
  }

  function openEdit(item) {
    setEditingItem(item);
    setSheetOpen(true);
  }

  function handleDeleteOne(item) {
    if (!window.confirm(t("confirmDeleteItems", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deleteItemsAction(companySlug, [item.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("itemsDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeleteItems", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deleteItemsAction(companySlug, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("itemsDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [
    {
      key: "name",
      header: t("itemName"),
      sortable: true,
      render: (item) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <CategoryIcon name={item.categoryIcon} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{item.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {item.categoryName || t("notSet")}
              {item.attributeValueNames?.length > 0 && ` • ${item.attributeValueNames.join(", ")}`}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "primaryUnitCode",
      header: t("primaryUnit"),
      render: (item) => (
        <span>
          {item.primaryUnitCode}
          {item.secondaryUnitName ? (
            <span className="text-muted-foreground"> / {item.secondaryUnitName}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "purchasePrice",
      header: t("purchasePrice"),
      sortable: true,
      className: "flex-none w-32 justify-end text-right",
      render: (item) => formatAmount(item.purchasePrice),
    },
    {
      key: "sellingPrice",
      header: t("sellingPrice"),
      sortable: true,
      className: "flex-none w-32 justify-end text-right",
      render: (item) => formatAmount(item.sellingPrice),
    },
  ];

  const rowActions = (item) => [
    { key: "edit", label: t("edit"), icon: Pencil, onClick: () => openEdit(item) },
    {
      key: "delete",
      label: t("delete"),
      icon: Trash2,
      variant: "destructive",
      disabled: deleting,
      onClick: () => handleDeleteOne(item),
    },
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
        <Button type="button" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t("addItem")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialItems}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          rowActions={rowActions}
          bulkActions={bulkActions}
          filters={[
            {
              key: "categoryId",
              label: t("category"),
              options: categories.map((category) => ({ value: String(category.id), label: category.name })),
            },
          ]}
          emptyIcon={Package}
          emptyMessage={t("noItemsYet")}
          emptyAction={{ label: t("addItem"), onClick: openCreate }}
        />
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={editingItem ? t("editItem") : t("addItem")}>
        <ItemForm
          companySlug={companySlug}
          item={editingItem}
          categories={categories}
          units={units}
          partyGroups={partyGroups}
          attributes={attributes}
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

function ItemForm({ companySlug, item, categories, units, partyGroups, attributes, onDone, onClose }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [form, setForm] = useState(item ? toFormValues(item) : EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [pricingRows, setPricingRows] = useState([]);
  // Local copy of `attributes` so a value (or a whole new attribute)
  // quick-added mid-form shows up immediately, without waiting for the
  // page's server-fetched prop to catch up via router.refresh().
  const [attributeGroups, setAttributeGroups] = useState(() =>
    attributes.map((group) => ({ ...group, values: [...group.values] }))
  );
  // Repeatable rows, same shape as pricingRows: pick which attribute
  // (Color, Size, ...), then which of its values apply — one row per
  // attribute, so an item can carry more than one (e.g. a T-shirt's Size
  // AND Color).
  const [attributeRows, setAttributeRows] = useState([]);
  // Both pricingRows and attributeRows are loaded async (below) when editing
  // an existing item, then submitted as a full-replace sync server-side
  // (syncItemPartyGroupPrices/syncItemAttributeValues in actions.js). If
  // Save is clicked before either fetch resolves, the still-empty arrays
  // would be sent as "the truth" and wipe the item's real existing party
  // group prices / attribute assignments. These two flags gate the Save
  // button so that race can't happen — both start true for the create case
  // (nothing to wait for) and only start false while editing.
  const [pricingReady, setPricingReady] = useState(!item);
  const [attributesReady, setAttributesReady] = useState(!item);
  const [categoryQuickAdd, setCategoryQuickAdd] = useState(null);
  const [unitQuickAdd, setUnitQuickAdd] = useState(null);
  const [groupQuickAdd, setGroupQuickAdd] = useState(null);
  const [attributeQuickAdd, setAttributeQuickAdd] = useState(null);
  const [attributeValueQuickAdd, setAttributeValueQuickAdd] = useState(null);
  const rowKeyCounter = useRef(0);

  function nextRowKey() {
    rowKeyCounter.current += 1;
    return `row-${rowKeyCounter.current}`;
  }

  useEffect(() => {
    // ItemForm remounts fresh each time the Sheet opens (see sheet.jsx's
    // conditional render), so pricingRows' useState([]) initializer already
    // covers the create case — nothing to reset here when there's no item.
    if (!item) return undefined;
    let cancelled = false;
    getItemPartyGroupPrices(companySlug, item.id).then((rows) => {
      if (cancelled) return;
      setPricingRows(
        rows.map((row) => ({
          key: nextRowKey(),
          partyGroupId: String(row.partyGroupId),
          sellingPrice: decimalToInputValue(row.sellingPrice),
        }))
      );
      setPricingReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [item, companySlug]);

  useEffect(() => {
    // Same remount-per-open reasoning as the pricingRows effect above —
    // attributeRows' useState([]) initializer already covers the create
    // case. getItemAttributeValueIds only returns a flat list of value ids,
    // so they're regrouped by attribute here (via attributeGroups' own
    // valueId -> attrId membership) to rebuild one row per attribute that
    // already has an assignment.
    if (!item) return undefined;
    let cancelled = false;
    getItemAttributeValueIds(companySlug, item.id).then((valueIds) => {
      if (cancelled) return;
      const attrIdByValueId = new Map();
      for (const group of attributeGroups) {
        for (const value of group.values) attrIdByValueId.set(value.id, group.id);
      }
      const rowsByAttrId = new Map();
      for (const valueId of valueIds) {
        const attrId = attrIdByValueId.get(valueId);
        if (attrId == null) continue;
        if (!rowsByAttrId.has(attrId)) rowsByAttrId.set(attrId, new Set());
        rowsByAttrId.get(attrId).add(valueId);
      }
      setAttributeRows(
        [...rowsByAttrId.entries()].map(([attrId, valueIds]) => ({
          key: nextRowKey(),
          attrId: String(attrId),
          valueIds,
        }))
      );
      setAttributesReady(true);
    });
    return () => {
      cancelled = true;
    };
    // attributeGroups is the props-derived list as it stood at mount time —
    // intentionally read once here, not tracked reactively (a mid-session
    // quick-add shouldn't retrigger a re-fetch/regroup of existing rows).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, companySlug]);

  // Category/unit/party-group all need a real small form to create (icon,
  // code+type, description) rather than just a typed name, so each uses
  // CreatableSelect's pinned onCreateNew — this opens the matching quick-add
  // modal and returns a Promise that resolves once it's submitted or
  // cancelled, which CreatableSelect awaits before selecting the result.
  function handleCreateCategory() {
    return new Promise((resolve) => setCategoryQuickAdd({ resolve }));
  }

  function handleCreateUnit() {
    return new Promise((resolve) => setUnitQuickAdd({ resolve }));
  }

  function handleCreatePartyGroup() {
    return new Promise((resolve) => setGroupQuickAdd({ resolve }));
  }

  // Attribute rows follow the same onCreateNew promise pattern — CreatableSelect
  // itself calls onChange(result.value) once the modal resolves, so this
  // doesn't need to know which row asked for it.
  function handleCreateAttribute() {
    return new Promise((resolve) => setAttributeQuickAdd({ resolve }));
  }

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function addPricingRow() {
    setPricingRows((current) => [...current, { key: nextRowKey(), partyGroupId: "", sellingPrice: "" }]);
  }

  function updatePricingRow(key, field, value) {
    setPricingRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  }

  function removePricingRow(key) {
    setPricingRows((current) => current.filter((row) => row.key !== key));
  }

  function addAttributeRow() {
    setAttributeRows((current) => [...current, { key: nextRowKey(), attrId: "", valueIds: new Set() }]);
  }

  function updateAttributeRowAttr(rowKey, attrId) {
    // Switching a row to a different attribute drops its previously
    // selected values — they belonged to the old attribute.
    setAttributeRows((current) =>
      current.map((row) => (row.key === rowKey ? { key: rowKey, attrId, valueIds: new Set() } : row))
    );
  }

  function removeAttributeRow(rowKey) {
    setAttributeRows((current) => current.filter((row) => row.key !== rowKey));
  }

  function toggleRowValue(rowKey, valueId) {
    setAttributeRows((current) =>
      current.map((row) => {
        if (row.key !== rowKey) return row;
        const next = new Set(row.valueIds);
        if (next.has(valueId)) next.delete(valueId);
        else next.add(valueId);
        return { ...row, valueIds: next };
      })
    );
  }

  // Same attribute can't be picked twice — mirrors groupOptionsForRow below.
  function attributeOptionsForRow(rowKey) {
    const usedElsewhere = new Set(
      attributeRows.filter((row) => row.key !== rowKey && row.attrId).map((row) => row.attrId)
    );
    return attributeGroups
      .filter((group) => !usedElsewhere.has(String(group.id)))
      .map((group) => ({ value: String(group.id), label: group.name }));
  }

  function handleAttributeValueCreated(rowKey, attrId, result) {
    setAttributeGroups((current) =>
      current.map((group) =>
        group.id === attrId ? { ...group, values: [...group.values, { id: result.id, name: result.name }] } : group
      )
    );
    setAttributeRows((current) =>
      current.map((row) => (row.key === rowKey ? { ...row, valueIds: new Set(row.valueIds).add(result.id) } : row))
    );
  }

  // Same group can't be picked in two rows — each row sees every group
  // except whichever ones other rows have already claimed.
  function groupOptionsForRow(rowKey) {
    const usedElsewhere = new Set(
      pricingRows.filter((row) => row.key !== rowKey && row.partyGroupId).map((row) => row.partyGroupId)
    );
    return partyGroups
      .filter((group) => !usedElsewhere.has(String(group.id)))
      .map((group) => ({ value: String(group.id), label: group.name }));
  }

  function submit() {
    // Belt-and-suspenders alongside the Save button's disabled state below —
    // don't let a full-replace sync fire with party group / attribute rows
    // that haven't finished loading yet from the server (see pricingReady/
    // attributesReady above).
    if (!pricingReady || !attributesReady) return;
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    startSubmit();
  }

  async function startSubmit() {
    const partyGroupPrices = pricingRows
      .filter((row) => row.partyGroupId && row.sellingPrice.trim() !== "")
      .map((row) => ({ partyGroupId: Number(row.partyGroupId), sellingPrice: row.sellingPrice }));
    const attributeValueIds = attributeRows.flatMap((row) => [...row.valueIds]);
    const payload = { ...form, partyGroupPrices, attributeValueIds };

    const result = item
      ? await updateItemAction(companySlug, item.id, payload)
      : await createItemAction(companySlug, payload);
    setPending(false);
    if (!result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onDone(result.message);
  }

  const unitOptions = units.map((unit) => ({ value: String(unit.id), label: `${unit.name} (${unit.code})` }));
  const secondaryUnitOptions = [{ value: "", label: t("none") }, ...unitOptions];
  const primaryUnitName = units.find((unit) => String(unit.id) === form.primaryUnitId)?.name;
  const secondaryUnitName = units.find((unit) => String(unit.id) === form.secondaryUnitId)?.name;

  return (
    <div className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="item-name">{t("itemName")}</Label>
        <Input id="item-name" className="h-11" value={form.name} onChange={(event) => update("name", event.target.value)} />
        {fieldErrors.name?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.name[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="item-category">{t("category")}</Label>
        <CreatableSelect
          id="item-category"
          options={categories.map((category) => ({ value: String(category.id), label: category.name }))}
          value={form.categoryId}
          onChange={(value) => update("categoryId", value)}
          onCreateNew={handleCreateCategory}
          createNewLabel={t("addItemCategory")}
          placeholder={t("notSet")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="item-primary-unit">{t("primaryUnit")}</Label>
          <CreatableSelect
            id="item-primary-unit"
            options={unitOptions}
            value={form.primaryUnitId}
            onChange={(value) => update("primaryUnitId", value)}
            onCreateNew={handleCreateUnit}
            createNewLabel={t("quickAddUnit")}
            placeholder={t("notSet")}
          />
          {fieldErrors.primaryUnitId?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.primaryUnitId[0])}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="item-secondary-unit">{t("secondaryUnit")}</Label>
          <CreatableSelect
            id="item-secondary-unit"
            options={secondaryUnitOptions}
            value={form.secondaryUnitId}
            onChange={(value) => update("secondaryUnitId", value)}
            onCreateNew={handleCreateUnit}
            createNewLabel={t("quickAddUnit")}
            placeholder={t("none")}
          />
        </div>
      </div>

      {form.secondaryUnitId && (
        <div className="space-y-1.5">
          <Label htmlFor="item-conversion-factor">{t("conversionFactor")}</Label>
          <Input
            id="item-conversion-factor"
            type="number"
            min="1"
            step="1"
            className="h-11"
            value={form.conversionFactor}
            onChange={(event) => update("conversionFactor", event.target.value)}
          />
          {fieldErrors.conversionFactor?.[0] ? (
            <p className="text-xs text-destructive">{t(fieldErrors.conversionFactor[0])}</p>
          ) : (
            primaryUnitName &&
            secondaryUnitName &&
            form.conversionFactor && (
              <p className="text-xs text-muted-foreground">
                {t("conversionFactorHint", {
                  primaryUnit: primaryUnitName,
                  factor: form.conversionFactor,
                  secondaryUnit: secondaryUnitName,
                })}
              </p>
            )
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="item-purchase-price">{t("purchasePrice")}</Label>
          <Input
            id="item-purchase-price"
            type="number"
            className="h-11"
            value={form.purchasePrice}
            onChange={(event) => update("purchasePrice", event.target.value)}
          />
          {fieldErrors.purchasePrice?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.purchasePrice[0])}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="item-selling-price">{t("sellingPrice")}</Label>
          <Input
            id="item-selling-price"
            type="number"
            className="h-11"
            value={form.sellingPrice}
            onChange={(event) => update("sellingPrice", event.target.value)}
          />
          {fieldErrors.sellingPrice?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.sellingPrice[0])}</p>}
        </div>
      </div>

      <div className="space-y-2 rounded-xl border p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{t("partyGroupPricing")}</p>
            <p className="text-xs text-muted-foreground">{t("partyGroupPricingHint")}</p>
          </div>
        </div>
        {fieldErrors.partyGroupPrices?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.partyGroupPrices[0])}</p>}

        {pricingRows.length > 0 && (
          <div className="space-y-2">
            {pricingRows.map((row) => (
              <div key={row.key} className="flex items-center gap-2">
                <CreatableSelect
                  className="flex-1"
                  options={groupOptionsForRow(row.key)}
                  value={row.partyGroupId}
                  onChange={(value) => updatePricingRow(row.key, "partyGroupId", value)}
                  onCreateNew={handleCreatePartyGroup}
                  createNewLabel={t("addPartyGroup")}
                  placeholder={t("partyGroup")}
                />
                <Input
                  type="number"
                  className="h-11 w-32 shrink-0"
                  placeholder={t("sellingPrice")}
                  value={row.sellingPrice}
                  onChange={(event) => updatePricingRow(row.key, "sellingPrice", event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removePricingRow(row.key)}
                  aria-label={t("delete")}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addPricingRow}
          disabled={partyGroups.length > 0 && pricingRows.length >= partyGroups.length}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("partyGroupPricing")}
        </Button>
      </div>

      <div className="space-y-2 rounded-xl border p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{t("assignAttributeValues")}</p>
            <p className="text-xs text-muted-foreground">{t("assignAttributeValuesHint")}</p>
          </div>
        </div>

        {attributeRows.length > 0 && (
          <div className="space-y-2">
            {attributeRows.map((row) => {
              const group = attributeGroups.find((candidate) => String(candidate.id) === row.attrId);
              return (
                <div key={row.key} className="space-y-2 rounded-lg bg-muted/40 p-2.5">
                  <div className="flex items-center gap-2">
                    <CreatableSelect
                      className="flex-1"
                      options={attributeOptionsForRow(row.key)}
                      value={row.attrId}
                      onChange={(value) => updateAttributeRowAttr(row.key, value)}
                      onCreateNew={handleCreateAttribute}
                      createNewLabel={t("addAttribute")}
                      placeholder={t("attributeName")}
                    />
                    <button
                      type="button"
                      onClick={() => removeAttributeRow(row.key)}
                      aria-label={t("delete")}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {group && (
                    <div className="flex flex-wrap gap-2">
                      {group.values.map((value) => {
                        const selected = row.valueIds.has(value.id);
                        return (
                          <button
                            key={value.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggleRowValue(row.key, value.id)}
                            className={cn(
                              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                              selected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-transparent bg-background text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {value.name}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setAttributeValueQuickAdd({ rowKey: row.key, attrId: group.id })}
                        className="flex items-center gap-1 rounded-lg border border-dashed px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t("addAttributeValue")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addAttributeRow}
          disabled={attributeGroups.length > 0 && attributeRows.length >= attributeGroups.length}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("assignAttributeValues")}
        </Button>
      </div>

      <div className="space-y-2 rounded-xl bg-muted/60 p-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="item-barcode-input"
            checked={form.barcodeInput}
            onCheckedChange={(checked) => update("barcodeInput", checked === true)}
          />
          <Label htmlFor="item-barcode-input" className="cursor-pointer">
            {t("barcodeInput")}
          </Label>
        </div>
        {form.barcodeInput && (
          <Input
            className="h-11"
            value={form.barcodeValue}
            onChange={(event) => update("barcodeValue", event.target.value)}
            placeholder={t("barcodeValue")}
          />
        )}
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="button" onClick={submit} disabled={pending || !pricingReady || !attributesReady}>
          {pending || !pricingReady || !attributesReady ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {pending ? t("saving") : t("saveChanges")}
        </Button>
      </div>

      {categoryQuickAdd && (
        <Modal
          open
          onClose={() => {
            categoryQuickAdd.resolve(null);
            setCategoryQuickAdd(null);
          }}
          title={t("addItemCategory")}
        >
          <CategoryQuickAddForm
            companySlug={companySlug}
            onCancel={() => {
              categoryQuickAdd.resolve(null);
              setCategoryQuickAdd(null);
            }}
            onCreated={(result) => {
              categoryQuickAdd.resolve(result);
              setCategoryQuickAdd(null);
              router.refresh();
            }}
          />
        </Modal>
      )}

      {unitQuickAdd && (
        <Modal
          open
          onClose={() => {
            unitQuickAdd.resolve(null);
            setUnitQuickAdd(null);
          }}
          title={t("quickAddUnit")}
        >
          <UnitQuickAddForm
            companySlug={companySlug}
            onCancel={() => {
              unitQuickAdd.resolve(null);
              setUnitQuickAdd(null);
            }}
            onCreated={(result) => {
              unitQuickAdd.resolve(result);
              setUnitQuickAdd(null);
              router.refresh();
            }}
          />
        </Modal>
      )}

      {groupQuickAdd && (
        <Modal
          open
          onClose={() => {
            groupQuickAdd.resolve(null);
            setGroupQuickAdd(null);
          }}
          title={t("addPartyGroup")}
        >
          <PartyGroupQuickAddForm
            companySlug={companySlug}
            onCancel={() => {
              groupQuickAdd.resolve(null);
              setGroupQuickAdd(null);
            }}
            onCreated={(result) => {
              groupQuickAdd.resolve(result);
              setGroupQuickAdd(null);
              router.refresh();
            }}
          />
        </Modal>
      )}

      {attributeQuickAdd && (
        <Modal
          open
          onClose={() => {
            attributeQuickAdd.resolve(null);
            setAttributeQuickAdd(null);
          }}
          title={t("addAttribute")}
        >
          <AttributeQuickAddForm
            companySlug={companySlug}
            onCancel={() => {
              attributeQuickAdd.resolve(null);
              setAttributeQuickAdd(null);
            }}
            onCreated={(result) => {
              setAttributeGroups((current) => [...current, { id: result.id, name: result.name, values: [] }]);
              attributeQuickAdd.resolve({ value: String(result.id), label: result.name });
              setAttributeQuickAdd(null);
              router.refresh();
            }}
          />
        </Modal>
      )}

      {attributeValueQuickAdd && (
        <Modal open onClose={() => setAttributeValueQuickAdd(null)} title={t("addAttributeValue")}>
          <AttributeValueQuickAddForm
            companySlug={companySlug}
            attrId={attributeValueQuickAdd.attrId}
            onCancel={() => setAttributeValueQuickAdd(null)}
            onCreated={(result) => {
              handleAttributeValueCreated(attributeValueQuickAdd.rowKey, attributeValueQuickAdd.attrId, result);
              setAttributeValueQuickAdd(null);
              router.refresh();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function UnitQuickAddForm({ companySlug, onCancel, onCreated }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: "", code: "", type: "" });
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit() {
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    const result = await createUnitAction(companySlug, form);
    setPending(false);
    if (!result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onCreated({ value: String(result.id), label: `${result.name} (${result.code})` });
  }

  return (
    <div className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="quick-unit-name">{t("name")}</Label>
        <Input id="quick-unit-name" className="h-11" value={form.name} onChange={(event) => update("name", event.target.value)} />
        {fieldErrors.name?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.name[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="quick-unit-code">{t("code")}</Label>
        <Input id="quick-unit-code" className="h-11" value={form.code} onChange={(event) => update("code", event.target.value)} />
        {fieldErrors.code?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.code[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="quick-unit-type">{t("type")}</Label>
        <Input
          id="quick-unit-type"
          className="h-11"
          value={form.type}
          onChange={(event) => update("type", event.target.value)}
          placeholder={t("optional")}
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
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

// Opened from an attribute row's CreatableSelect onCreateNew (see
// ItemForm's handleCreateAttribute) — just the name, same as the real
// /items/attributes "Add Attribute" form; slug is auto-generated server-side.
function AttributeQuickAddForm({ companySlug, onCancel, onCreated }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  async function submit() {
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    const result = await createAttributeAction(companySlug, { name });
    setPending(false);
    if (!result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onCreated({ id: result.id, name: result.name });
  }

  return (
    <div className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="quick-attribute-name">{t("attributeName")}</Label>
        <Input id="quick-attribute-name" className="h-11" value={name} onChange={(event) => setName(event.target.value)} />
        {fieldErrors.name?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.name[0])}</p>}
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
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

// Scoped to one attribute (attrId is fixed, not a field) — opened from the
// "+ add value" affordance under an attribute row once it has an attribute
// selected (see ItemForm). A brand-new attribute is created via
// AttributeQuickAddForm above instead, from the row's own CreatableSelect.
function AttributeValueQuickAddForm({ companySlug, attrId, onCancel, onCreated }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  async function submit() {
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    const result = await createAttributeValueAction(companySlug, { attrId, name });
    setPending(false);
    if (!result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onCreated({ id: result.id, name: result.name });
  }

  return (
    <div className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="quick-attribute-value-name">{t("attributeValueName")}</Label>
        <Input
          id="quick-attribute-value-name"
          className="h-11"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {fieldErrors.name?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.name[0])}</p>}
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
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
