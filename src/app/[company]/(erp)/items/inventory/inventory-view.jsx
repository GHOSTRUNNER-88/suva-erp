"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftRight,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  History,
  Loader2,
  Package,
  Pencil,
  Printer,
  Search,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { exportInventoryToExcel } from "@/lib/export-excel";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { adjustInventoryAction, getStockLedger, transferStockAction } from "./actions";

// Quantities are decimal(14,4) but almost always whole numbers in practice
// (see ../../../AGENTS.md §6's note on document-line quantities) — trims
// the trailing zeros a raw decimal-string would otherwise show ("15.0000").
function formatQuantity(value) {
  const number = Number(value || 0);
  return number.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

// Explicit "+" for positive deltas — quantityChange is a signed decimal
// string already ("−15.0000" for removals via Number's own minus sign), so
// only the positive case needs a sign prepended.
function formatSignedQuantity(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${formatQuantity(number)}`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-CA").format(new Date(value));
}

const CHANGE_TYPE_LABEL_KEYS = {
  set: "stockModeSet",
  add: "stockModeAdd",
  remove: "stockModeRemove",
  transfer_in: "transferIn",
  transfer_out: "transferOut",
};

const CHANGE_TYPE_TONE = {
  set: "bg-muted text-foreground",
  add: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  transfer_in: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  remove: "bg-destructive/10 text-destructive",
  transfer_out: "bg-destructive/10 text-destructive",
};

// Flattens the item -> variant -> warehouse tree into one row per leaf,
// matching legacy's own admin/inventory.php shape (one row per item/variant/
// warehouse) and what the Excel/print exports need — shared by both so
// export always matches whatever's currently filtered on screen.
function flattenTree(tree) {
  const rows = [];
  for (const item of tree) {
    for (const variant of item.variants) {
      for (const wh of variant.warehouses) {
        rows.push({
          itemName: item.name,
          categoryName: item.categoryName,
          variantName: variant.valueName,
          warehouseName: wh.warehouseName,
          quantity: wh.quantity,
          unitCode: item.primaryUnitCode,
        });
      }
    }
  }
  return rows;
}

/**
 * Item -> variant -> warehouse stock tree. Adjust/Transfer are launched
 * from the specific warehouse row they apply to (pre-filling item/variant/
 * warehouse) rather than a generic top-level modal with cascading pickers
 * like legacy's admin/inventory.php — the tree itself already is the
 * picker, so a second one would just duplicate that navigation.
 */
export default function InventoryView({ companySlug, initialTree, warehouses, categories, activeWarehouseId, organization }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [expanded, setExpanded] = useState(new Set());
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
  const [ledgerTarget, setLedgerTarget] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [exporting, setExporting] = useState(false);

  function toggleExpanded(itemId) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function handleWarehouseFilterChange(value) {
    router.push(`/${companySlug}/items/inventory${value ? `?warehouse=${value}` : ""}`);
  }

  function handleDone(setTarget) {
    return (message, warning) => {
      setTarget(null);
      notify.success(t(message));
      if (warning) notify.error(t(warning));
      router.refresh();
    };
  }

  const warehouseOptions = [{ value: "", label: t("allWarehouses") }, ...warehouses.map((w) => ({ value: String(w.id), label: w.name }))];
  const categoryOptions = [{ value: "", label: t("allCategories") }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))];

  const filteredTree = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const selectedCategoryName = categoryFilter ? categories.find((c) => String(c.id) === categoryFilter)?.name : null;
    return initialTree.filter((item) => {
      if (query && !item.name.toLowerCase().includes(query)) return false;
      if (selectedCategoryName && item.categoryName !== selectedCategoryName) return false;
      return true;
    });
  }, [initialTree, searchQuery, categoryFilter, categories]);

  // Export/print always reflect what's currently filtered on screen (search +
  // category + warehouse), not the raw initialTree.
  const flattenedRows = useMemo(() => flattenTree(filteredTree), [filteredTree]);

  async function handleExportExcel() {
    setExporting(true);
    try {
      await exportInventoryToExcel({
        organizationName: organization?.name,
        rows: flattenedRows,
        filename: `inventory-${new Date().toISOString().slice(0, 10)}.xlsx`,
        labels: {
          sheetName: t("inventory").slice(0, 31),
          title: t("inventory"),
          item: t("itemName"),
          category: t("category"),
          variant: t("variant"),
          warehouse: t("warehouse"),
          quantity: t("quantity"),
          unit: t("primaryUnit"),
        },
      });
    } catch {
      notify.error(t("somethingWentWrong"));
    } finally {
      setExporting(false);
    }
  }

  const isGenuinelyEmpty = initialTree.length === 0;
  const hasNoMatches = !isGenuinelyEmpty && filteredTree.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="relative min-w-40 max-w-xs flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-11 pl-9"
          />
        </div>
        <div className="w-52">
          <CreatableSelect
            options={categoryOptions}
            value={categoryFilter}
            onChange={setCategoryFilter}
            placeholder={t("allCategories")}
          />
        </div>
        <div className="w-52">
          <CreatableSelect
            options={warehouseOptions}
            value={activeWarehouseId}
            onChange={handleWarehouseFilterChange}
            placeholder={t("allWarehouses")}
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" disabled={exporting} onClick={handleExportExcel}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {t("exportExcel")}
          </Button>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            {t("print")}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-background print:hidden">
        {isGenuinelyEmpty ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-muted-foreground">
            <Package className="h-8 w-8 opacity-40" />
            <p className="text-sm">{t("noItemsYet")}</p>
          </div>
        ) : hasNoMatches ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-muted-foreground">
            <Search className="h-8 w-8 opacity-40" />
            <p className="text-sm">{t("noResults")}</p>
          </div>
        ) : (
          filteredTree.map((item) =>
            item.hasVariants ? (
              <ExpandableItemRow
                key={item.id}
                item={item}
                warehouses={warehouses}
                isExpanded={expanded.has(item.id)}
                onToggle={() => toggleExpanded(item.id)}
                onAdjust={setAdjustTarget}
                onTransfer={setTransferTarget}
                onViewLedger={setLedgerTarget}
              />
            ) : (
              <FlatItemRow
                key={item.id}
                item={item}
                warehouses={warehouses}
                onAdjust={setAdjustTarget}
                onTransfer={setTransferTarget}
                onViewLedger={setLedgerTarget}
              />
            )
          )
        )}
      </div>

      {/* Print-only letterhead + flattened table — deliberately plain
         black-on-white (not the theme's bg-background/text-foreground
         tokens), since those resolve to near-white text in dark mode and
         would print invisible on paper regardless of which theme the screen
         happened to be in. Mirrors parties/party-ledger-view.jsx's print
         block. */}
      <div className="hidden print:block">
        <div className="flex items-center justify-between border-b-2 border-gray-800 pb-3">
          <div className="flex items-center gap-3">
            {organization?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Firebase Storage URL, not a local/optimizable asset
              <img src={organization.logoUrl} alt="" className="h-12 w-12 rounded object-cover" />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded bg-gray-100">
                <Building2 className="h-6 w-6 text-gray-500" />
              </div>
            )}
            <div>
              <p className="text-lg font-bold text-gray-900">{organization?.name ?? ""}</p>
              <p className="text-xs text-gray-500">{t("inventory")}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            {t("generatedOn")}: {formatDate(new Date())}
          </p>
        </div>

        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-gray-800">
              <th className="py-2 text-left font-semibold text-gray-900">{t("itemName")}</th>
              <th className="py-2 text-left font-semibold text-gray-900">{t("category")}</th>
              <th className="py-2 text-left font-semibold text-gray-900">{t("variant")}</th>
              <th className="py-2 text-left font-semibold text-gray-900">{t("warehouse")}</th>
              <th className="py-2 text-right font-semibold text-gray-900">{t("quantity")}</th>
            </tr>
          </thead>
          <tbody>
            {flattenedRows.map((row, index) => (
              <tr key={index} className="border-b border-gray-300">
                <td className="py-2 text-gray-900">{row.itemName}</td>
                <td className="py-2 text-gray-700">{row.categoryName || "—"}</td>
                <td className="py-2 text-gray-700">{row.variantName || "—"}</td>
                <td className="py-2 text-gray-700">{row.warehouseName}</td>
                <td className="py-2 text-right text-gray-900">
                  {formatQuantity(row.quantity)} {row.unitCode}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex items-center justify-between border-t border-gray-300 pt-3 text-xs text-gray-500">
          <p>{t("poweredBySuvacorp")}</p>
        </div>
      </div>

      {adjustTarget && (
        <Modal open onClose={() => setAdjustTarget(null)} title={t("adjustStock")}>
          <AdjustStockForm
            companySlug={companySlug}
            target={adjustTarget}
            onClose={() => setAdjustTarget(null)}
            onDone={handleDone(setAdjustTarget)}
          />
        </Modal>
      )}

      {transferTarget && (
        <Modal open onClose={() => setTransferTarget(null)} title={t("transferStock")}>
          <TransferStockForm
            companySlug={companySlug}
            target={transferTarget}
            warehouses={warehouses}
            onClose={() => setTransferTarget(null)}
            onDone={handleDone(setTransferTarget)}
          />
        </Modal>
      )}

      {ledgerTarget && (
        <Modal open onClose={() => setLedgerTarget(null)} title={t("stockLedger")} className="max-w-2xl">
          {/* Keyed per cell so switching targets (in the unlikely case the
             modal stays open across a click) remounts fresh state instead of
             reusing a stale loading/rows pair from the previous cell. */}
          <StockLedgerContent
            key={`${ledgerTarget.itemId}-${ledgerTarget.variantId}-${ledgerTarget.warehouseId}`}
            companySlug={companySlug}
            target={ledgerTarget}
          />
        </Modal>
      )}
    </div>
  );
}

// Shared by both ExpandableItemRow (one call per variant) and FlatItemRow
// (a single call for the item's one "no variant" bucket) — same warehouse
// breakdown + Adjust/Transfer/Ledger buttons either way, only the presence
// of a variant name header differs.
function VariantWarehouses({ item, variant, warehouses, onAdjust, onTransfer, onViewLedger }) {
  const { t } = useTranslation();
  return (
    <div className="pl-11">
      {variant.valueName && (
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs font-semibold text-foreground">{variant.valueName}</span>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {formatQuantity(variant.totalQuantity)} {item.primaryUnitCode}
          </span>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border bg-background">
        {variant.warehouses.map((wh) => (
          <div key={wh.warehouseId} className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm last:border-b-0">
            <span className="min-w-0 truncate text-muted-foreground">{wh.warehouseName}</span>
            <div className="flex shrink-0 items-center gap-3">
              <span className={cn("font-medium tabular-nums", wh.quantity < 0 && "text-destructive")}>
                {formatQuantity(wh.quantity)} {item.primaryUnitCode}
              </span>
              <button
                type="button"
                onClick={() =>
                  onAdjust({
                    itemId: item.id,
                    itemName: item.name,
                    variantId: variant.valueId,
                    variantLabel: variant.valueName,
                    warehouseId: wh.warehouseId,
                    warehouseName: wh.warehouseName,
                    currentQuantity: wh.quantity,
                    unitCode: item.primaryUnitCode,
                  })
                }
                aria-label={t("adjustStock")}
                title={t("adjustStock")}
                className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {warehouses.length >= 2 && (
                <button
                  type="button"
                  onClick={() =>
                    onTransfer({
                      itemId: item.id,
                      itemName: item.name,
                      variantId: variant.valueId,
                      variantLabel: variant.valueName,
                      fromWarehouseId: wh.warehouseId,
                      fromWarehouseName: wh.warehouseName,
                      unitCode: item.primaryUnitCode,
                    })
                  }
                  aria-label={t("transferStock")}
                  title={t("transferStock")}
                  className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  onViewLedger({
                    itemId: item.id,
                    itemName: item.name,
                    variantId: variant.valueId,
                    variantLabel: variant.valueName,
                    warehouseId: wh.warehouseId,
                    warehouseName: wh.warehouseName,
                    unitCode: item.primaryUnitCode,
                  })
                }
                aria-label={t("stockLedger")}
                title={t("stockLedger")}
                className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <History className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// hasVariants === true: keeps the click-to-expand/collapse behavior,
// collapsed by default.
function ExpandableItemRow({ item, warehouses, isExpanded, onToggle, onAdjust, onTransfer, onViewLedger }) {
  const { t } = useTranslation();
  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          <Package className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <p className="truncate text-xs text-muted-foreground">{item.categoryName || t("notSet")}</p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatQuantity(item.totalQuantity)}{" "}
          <span className="text-xs font-normal text-muted-foreground">{item.primaryUnitCode}</span>
        </span>
      </button>

      {isExpanded && (
        <div className="space-y-3 bg-muted/20 px-4 pb-4">
          {item.variants.length === 0 ? (
            <p className="pl-11 text-xs text-muted-foreground">{t("noResults")}</p>
          ) : (
            item.variants.map((variant) => (
              <VariantWarehouses
                key={variant.valueId}
                item={item}
                variant={variant}
                warehouses={warehouses}
                onAdjust={onAdjust}
                onTransfer={onTransfer}
                onViewLedger={onViewLedger}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// hasVariants === false: no chevron, no click handler — the single "no
// variant" bucket's warehouse breakdown is always visible directly under
// the item row, never collapsed.
function FlatItemRow({ item, warehouses, onAdjust, onTransfer, onViewLedger }) {
  const { t } = useTranslation();
  return (
    <div className="border-b last:border-b-0">
      <div className="flex w-full items-center gap-3 px-4 py-3">
        {/* Spacer matching the expandable row's chevron width, so the item
           icon lines up in the same column across both row kinds. */}
        <span className="h-4 w-4 shrink-0" />
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          <Package className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <p className="truncate text-xs text-muted-foreground">{item.categoryName || t("notSet")}</p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatQuantity(item.totalQuantity)}{" "}
          <span className="text-xs font-normal text-muted-foreground">{item.primaryUnitCode}</span>
        </span>
      </div>

      <div className="space-y-3 bg-muted/20 px-4 pb-4">
        {item.variants.length === 0 ? (
          <p className="pl-11 text-xs text-muted-foreground">{t("noResults")}</p>
        ) : (
          <VariantWarehouses
            item={item}
            variant={item.variants[0]}
            warehouses={warehouses}
            onAdjust={onAdjust}
            onTransfer={onTransfer}
            onViewLedger={onViewLedger}
          />
        )}
      </div>
    </div>
  );
}

// Fetches lazily on open (matches items-view.jsx's pricingRows/attributeRows
// effects) rather than the parent prefetching every cell's history up front
// — a tree with many rows would otherwise fire dozens of ledger queries
// nobody asked for.
function StockLedgerContent({ companySlug, target }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getStockLedger(companySlug, {
      itemId: target.itemId,
      variantId: target.variantId,
      warehouseId: target.warehouseId,
    }).then((result) => {
      if (cancelled) return;
      setRows(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [companySlug, target.itemId, target.variantId, target.warehouseId]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted/60 p-3 text-sm">
        <p className="font-medium">
          {target.itemName}
          {target.variantLabel ? ` — ${target.variantLabel}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">{target.warehouseName}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("noStockLedgerEntriesYet")}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-[100px_110px_110px_110px_1fr] gap-2 border-b bg-muted/60 px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <span>{t("transactionDate")}</span>
            <span>{t("type")}</span>
            <span className="text-right">{t("change")}</span>
            <span className="text-right">{t("balanceAfter")}</span>
            <span>{t("note")}</span>
          </div>
          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-[100px_110px_110px_110px_1fr] items-center gap-2 border-b px-3 py-2 text-xs last:border-b-0">
              <span className="text-muted-foreground">{formatDate(row.createdAt)}</span>
              <span>
                <span className={cn("inline-block rounded-full px-2 py-0.5 text-[0.7rem] font-medium", CHANGE_TYPE_TONE[row.changeType])}>
                  {t(CHANGE_TYPE_LABEL_KEYS[row.changeType])}
                </span>
              </span>
              <span
                className={cn(
                  "text-right font-medium tabular-nums",
                  Number(row.quantityChange) > 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : Number(row.quantityChange) < 0
                      ? "text-destructive"
                      : "text-foreground"
                )}
              >
                {formatSignedQuantity(row.quantityChange)}
              </span>
              <span className="text-right font-medium tabular-nums text-foreground">
                {formatQuantity(row.quantityAfter)} {target.unitCode}
              </span>
              <span className="min-w-0 truncate text-muted-foreground">{row.note || "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdjustStockForm({ companySlug, target, onClose, onDone }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState("set");
  const [amount, setAmount] = useState(String(Number(target.currentQuantity)));
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  function handleModeChange(value) {
    setMode(value);
    setAmount(value === "set" ? String(Number(target.currentQuantity)) : "");
  }

  async function submit() {
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    const result = await adjustInventoryAction(companySlug, {
      itemId: target.itemId,
      variantId: target.variantId,
      warehouseId: target.warehouseId,
      mode,
      amount,
    });
    setPending(false);
    if (!result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onDone(result.message, result.warning);
  }

  return (
    <div className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg bg-muted/60 p-3 text-sm">
        <p className="font-medium">
          {target.itemName}
          {target.variantLabel ? ` — ${target.variantLabel}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">{target.warehouseName}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("quantity")}:{" "}
          <span className="font-medium text-foreground">
            {formatQuantity(target.currentQuantity)} {target.unitCode}
          </span>
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>{t("adjustStock")}</Label>
        <SegmentedControl
          options={[
            { value: "set", label: t("stockModeSet") },
            { value: "add", label: t("stockModeAdd") },
            { value: "remove", label: t("stockModeRemove") },
          ]}
          value={mode}
          onChange={handleModeChange}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="adjust-stock-amount">{t("quantity")}</Label>
        <Input
          id="adjust-stock-amount"
          type="number"
          step="any"
          min="0"
          className="h-11"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        {fieldErrors.amount?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.amount[0])}</p>}
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

function TransferStockForm({ companySlug, target, warehouses, onClose, onDone }) {
  const { t } = useTranslation();
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  async function submit() {
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    const result = await transferStockAction(companySlug, {
      itemId: target.itemId,
      variantId: target.variantId,
      fromWarehouseId: target.fromWarehouseId,
      toWarehouseId,
      amount,
    });
    setPending(false);
    if (!result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onDone(result.message, result.warning);
  }

  const toOptions = warehouses
    .filter((warehouse) => warehouse.id !== target.fromWarehouseId)
    .map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name }));

  return (
    <div className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg bg-muted/60 p-3 text-sm">
        <p className="font-medium">
          {target.itemName}
          {target.variantLabel ? ` — ${target.variantLabel}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("fromWarehouse")}: <span className="font-medium text-foreground">{target.fromWarehouseName}</span>
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="transfer-to-warehouse">{t("toWarehouse")}</Label>
        <CreatableSelect
          id="transfer-to-warehouse"
          options={toOptions}
          value={toWarehouseId}
          onChange={setToWarehouseId}
          placeholder={t("toWarehouse")}
        />
        {fieldErrors.toWarehouseId?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.toWarehouseId[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="transfer-stock-amount">{t("quantity")}</Label>
        <Input
          id="transfer-stock-amount"
          type="number"
          step="any"
          min="0"
          className="h-11"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        {fieldErrors.amount?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.amount[0])}</p>}
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
          {pending ? t("saving") : t("transferStock")}
        </Button>
      </div>
    </div>
  );
}
