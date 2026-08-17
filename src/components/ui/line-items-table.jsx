"use client";

import { useTranslation } from "react-i18next";
import { Percent, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { cn } from "@/lib/utils";

function Cell({ className, children }) {
  return <td className={cn("px-2 py-1.5 align-top", className)}>{children}</td>;
}

// Borderless, spreadsheet-style cell input — background/border only appear
// on focus, matching the reference design's minimal look (no boxed field
// per cell, just plain numbers until you click in).
function CellInput({ className, ...props }) {
  return (
    <input
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 text-sm outline-none transition-colors hover:bg-muted/60 focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
      {...props}
    />
  );
}

/**
 * Spreadsheet-style line-item editor — Item / Qty / Unit / Rate / Amount in
 * one flat table, matching the minimal reference design (no per-line card,
 * no always-visible discount column). Per-line discount still fully works
 * (the business logic requires it — see lib/money.js) but stays hidden
 * behind a small "%" toggle per row so the default view stays uncluttered;
 * click it to reveal a discount input for just that row.
 *
 * `lines` items need at minimum: localId, itemId, variantId, unitId,
 * quantity, rate, discType, discValue, lineTotal, and a resolved `item`
 * (for variant options / secondary unit). `showPricing=false` drops
 * Rate/Discount/Amount entirely (delivery challans carry no money).
 */
export function LineItemsTable({
  lines,
  itemOptions,
  onItemChange,
  onLineChange,
  onAddLine,
  onRemoveLine,
  unitOptionsForLine,
  formatAmount,
  showPricing = true,
  showVariant = true,
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Cell className="w-[40%]">{t("item")}</Cell>
              <Cell className="w-24">{t("quantity")}</Cell>
              <Cell className="w-28">{t("unit")}</Cell>
              {showPricing && <Cell className="w-32 text-right">{t("rate")}</Cell>}
              {showPricing && <Cell className="w-32 text-right">{t("amount")}</Cell>}
              <Cell className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const hasVariants = line.item?.variants?.length > 0;
              const hasSecondaryUnit = Boolean(line.item?.secondaryUnitId);
              const discountOpen = Boolean(line.discountOpen);
              return (
                <tr key={line.localId} className="border-b last:border-b-0">
                  <Cell>
                    <CreatableSelect
                      options={itemOptions}
                      value={line.itemId}
                      onChange={(value) => onItemChange(line.localId, value)}
                      placeholder={t("selectItem")}
                    />
                    {showVariant && hasVariants && (
                      <div className="mt-1">
                        <CreatableSelect
                          options={line.item.variants.map((variant) => ({ value: String(variant.id), label: variant.name }))}
                          value={line.variantId}
                          onChange={(value) => onLineChange(line.localId, { variantId: value })}
                          placeholder={t("noVariant")}
                          emptyLabel={t("noVariant")}
                        />
                      </div>
                    )}
                  </Cell>
                  <Cell>
                    <CellInput
                      type="number"
                      min="1"
                      step="1"
                      value={line.quantity}
                      onChange={(event) => onLineChange(line.localId, { quantity: event.target.value })}
                    />
                  </Cell>
                  <Cell>
                    {hasSecondaryUnit ? (
                      <select
                        className="h-8 w-full rounded-lg border border-transparent bg-transparent px-1.5 text-sm outline-none hover:bg-muted/60 focus-visible:border-ring focus-visible:bg-background"
                        value={line.unitId}
                        onChange={(event) => onLineChange(line.localId, { unitId: event.target.value })}
                      >
                        <option value={String(line.item.primaryUnitId)}>{line.item.primaryUnitCode}</option>
                        <option value={String(line.item.secondaryUnitId)}>{line.item.secondaryUnitCode}</option>
                      </select>
                    ) : (
                      <span className="block px-2 text-muted-foreground">{line.item?.primaryUnitCode ?? "—"}</span>
                    )}
                  </Cell>
                  {showPricing && (
                    <Cell>
                      <div className="flex items-center gap-1">
                        <CellInput
                          type="number"
                          min="0"
                          step="0.00001"
                          className="text-right"
                          value={line.rate}
                          onChange={(event) => onLineChange(line.localId, { rate: event.target.value })}
                        />
                        <button
                          type="button"
                          title={t("lineDiscount")}
                          onClick={() => onLineChange(line.localId, { discountOpen: !discountOpen })}
                          className={cn(
                            "grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
                            discountOpen && "bg-primary/15 text-primary"
                          )}
                        >
                          <Percent className="h-3 w-3" />
                        </button>
                      </div>
                      {discountOpen && (
                        <div className="mt-1 flex items-center gap-1">
                          <CellInput
                            type="number"
                            min="0"
                            step="0.01"
                            className="text-right"
                            value={line.discValue}
                            onChange={(event) => onLineChange(line.localId, { discValue: event.target.value })}
                            placeholder={t("lineDiscount")}
                          />
                          <select
                            className="h-8 rounded-lg border border-transparent bg-transparent px-1 text-xs outline-none hover:bg-muted/60"
                            value={line.discType}
                            onChange={(event) => onLineChange(line.localId, { discType: event.target.value })}
                          >
                            <option value="percent">%</option>
                            <option value="amount">Rs</option>
                          </select>
                        </div>
                      )}
                    </Cell>
                  )}
                  {showPricing && (
                    <Cell className="text-right font-medium tabular-nums">{formatAmount(line.lineTotal)}</Cell>
                  )}
                  <Cell>
                    <button
                      type="button"
                      disabled={lines.length === 1}
                      onClick={() => onRemoveLine(line.localId)}
                      aria-label={t("removeLine")}
                      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Cell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t p-2">
        <Button type="button" size="sm" variant="ghost" onClick={onAddLine} className="text-primary hover:text-primary">
          <Plus className="h-3.5 w-3.5" />
          {t("addRow")}
        </Button>
      </div>
    </div>
  );
}
