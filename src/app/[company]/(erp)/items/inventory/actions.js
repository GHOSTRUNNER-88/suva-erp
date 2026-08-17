"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  attributeValues,
  inventories,
  inventoryTransactions,
  itemCategories,
  items,
  units,
  warehouses,
} from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { getInventoryRow, getNegativeStockAction, writeInventoryDelta } from "@/lib/inventory";
import { z } from "zod";

/**
 * Ported from legacy models/Inventory.php (APP-REPORT.md §7.3 /
 * Inventories.sql) — same three-mode adjustment (set/add/remove), same
 * negative_stock_action three-way behavior. The nested item -> variant ->
 * warehouse tree shape (listInventoryTree) is a new presentation, not a
 * port — legacy's own admin/inventory.php renders one flat row per
 * (item, variant, warehouse); grouping it into a tree is a UI decision
 * (see ../../../AGENTS.md §6: logic is ported exact, UI is not locked to
 * the legacy look), the underlying data/rules are unchanged.
 */
const adjustInventorySchema = z.object({
  itemId: z.coerce.number().int().positive(),
  // 0 = legacy's "no variant" sentinel — see db/schema/organization.js's
  // inventories.variantId comment.
  variantId: z.coerce.number().int().min(0).default(0),
  warehouseId: z.coerce.number().int().positive("warehouseRequired"),
  mode: z.enum(["set", "add", "remove"]),
  amount: z.coerce.number().min(0, "quantityRequired"),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

// New feature, no legacy equivalent (grep confirmed nothing under
// admin/*.php or models/*.php resembling a warehouse-to-warehouse stock
// move) — built from the same primitives as adjustInventoryAction: decrement
// the source (same negative_stock_action gate as "remove" mode), increment
// the destination (same as "add" mode). Not wrapped in a DB transaction —
// this codebase doesn't use db.transaction anywhere yet (see items/actions.js,
// bank-accounts/actions.js's own two-leg transfer), so this stays consistent
// rather than introducing a new pattern for just this one write.
const stockTransferSchema = z
  .object({
    itemId: z.coerce.number().int().positive(),
    variantId: z.coerce.number().int().min(0).default(0),
    fromWarehouseId: z.coerce.number().int().positive("fromWarehouseRequired"),
    toWarehouseId: z.coerce.number().int().positive("toWarehouseRequired"),
    amount: z.coerce.number().positive("quantityRequired"),
    note: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((data) => data.fromWarehouseId !== data.toWarehouseId, {
    path: ["toWarehouseId"],
    message: "transferWarehousesMustDiffer",
  });

function canAccessItems(context) {
  return context.accessibleModules.includes("items");
}

/**
 * Item -> variant -> warehouse stock tree for the Inventory page. Always
 * includes every item (even ones with zero inventory rows yet, e.g.
 * created before any warehouse existed) so "this item currently has no
 * stock anywhere" is visible rather than the item just not appearing.
 * `warehouseId` narrows both the totals and the per-warehouse breakdown to
 * that one warehouse, matching legacy's get_all_inventory($warehouse_id).
 */
export async function listInventoryTree(companySlug, { warehouseId } = {}) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);

  const itemRows = await db
    .select({
      id: items.id,
      name: items.name,
      categoryName: itemCategories.name,
      primaryUnitCode: units.code,
    })
    .from(items)
    .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
    .innerJoin(units, eq(items.primaryUnitId, units.id))
    .orderBy(asc(items.name));

  let inventoryQuery = db
    .select({
      itemId: inventories.itemId,
      variantId: inventories.variantId,
      warehouseId: inventories.warehouseId,
      warehouseName: warehouses.name,
      quantity: inventories.quantity,
      valueName: attributeValues.name,
    })
    .from(inventories)
    .innerJoin(warehouses, eq(inventories.warehouseId, warehouses.id))
    .leftJoin(attributeValues, eq(inventories.variantId, attributeValues.id));
  if (warehouseId) {
    inventoryQuery = inventoryQuery.where(eq(inventories.warehouseId, Number(warehouseId)));
  }
  const invRows = await inventoryQuery.orderBy(asc(warehouses.name));

  const byItem = new Map();
  for (const row of invRows) {
    if (!byItem.has(row.itemId)) byItem.set(row.itemId, new Map());
    const variantMap = byItem.get(row.itemId);
    if (!variantMap.has(row.variantId)) {
      variantMap.set(row.variantId, { valueId: row.variantId, valueName: row.valueName, totalQuantity: 0, warehouses: [] });
    }
    const variant = variantMap.get(row.variantId);
    const quantity = Number(row.quantity);
    variant.totalQuantity += quantity;
    variant.warehouses.push({ warehouseId: row.warehouseId, warehouseName: row.warehouseName, quantity });
  }

  return itemRows.map((item) => {
    const variantMap = byItem.get(item.id);
    const variants = variantMap ? [...variantMap.values()] : [];
    // Items with real variants shouldn't also show the empty "no variant"
    // placeholder row — mirrors legacy's get_all_inventory() filter
    // (`NOT (variant_id=0 AND item has variants)`).
    const hasVariants = variants.some((variant) => variant.valueId !== 0);
    const visibleVariants = hasVariants ? variants.filter((variant) => variant.valueId !== 0) : variants;
    visibleVariants.sort((a, b) => (a.valueName ?? "").localeCompare(b.valueName ?? ""));

    return {
      id: item.id,
      name: item.name,
      categoryName: item.categoryName,
      primaryUnitCode: item.primaryUnitCode,
      hasVariants,
      totalQuantity: visibleVariants.reduce((sum, variant) => sum + variant.totalQuantity, 0),
      variants: visibleVariants,
    };
  });
}

// getInventoryRow/getNegativeStockAction/writeInventoryDelta now live in
// ../../../../lib/inventory.js — shared with every Sales/Purchase module
// (see that file's own comment for why it isn't a "use server" file).

// Chronological movement history for one (item, variant, warehouse) cell —
// the Inventory page's "View Ledger" drill-in. New table, so there's
// nothing to show for activity that predates it (e.g. the item-creation
// seed rows never wrote a ledger entry, only actual adjust/transfer calls
// do) — that's expected, not a bug.
export async function getStockLedger(companySlug, { itemId, variantId = 0, warehouseId }) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);

  return db
    .select()
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.itemId, Number(itemId)),
        eq(inventoryTransactions.variantId, Number(variantId)),
        eq(inventoryTransactions.warehouseId, Number(warehouseId))
      )
    )
    .orderBy(desc(inventoryTransactions.createdAt), desc(inventoryTransactions.id));
}

export async function adjustInventoryAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = adjustInventorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [item] = await db
    .select({ id: items.id, primaryUnitId: items.primaryUnitId })
    .from(items)
    .where(eq(items.id, data.itemId))
    .limit(1);
  if (!item) {
    return { ok: false, fieldErrors: {}, formError: "itemNotFound" };
  }

  const existing = await getInventoryRow(db, data.itemId, data.variantId, data.warehouseId);
  const currentQuantity = existing ? Number(existing.quantity) : 0;

  // Matches legacy's admin/inventory.php: 'set' overwrites outright (no
  // negative-stock check at all, same as set_inventory()); 'add'/'remove'
  // are deltas (matching adjust_inventory()) — only 'remove' can ever go
  // negative, since 'add's delta is always positive.
  const delta = data.mode === "set" ? data.amount - currentQuantity : data.mode === "add" ? data.amount : -data.amount;

  let warning = null;
  if (data.mode !== "set" && delta < 0 && currentQuantity + delta < 0) {
    const action = await getNegativeStockAction(db);
    if (action === 2) {
      return { ok: false, fieldErrors: {}, formError: "insufficientStock" };
    }
    if (action === 1) {
      warning = "stockWentNegative";
    }
  }

  await writeInventoryDelta(db, {
    itemId: data.itemId,
    variantId: data.variantId,
    warehouseId: data.warehouseId,
    unitId: item.primaryUnitId,
    existingRow: existing,
    delta,
    changeType: data.mode,
    note: data.note,
  });

  revalidatePath(`/${companySlug}/items/inventory`);
  return { ok: true, message: "inventoryAdjusted", warning };
}

export async function transferStockAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = stockTransferSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [item] = await db
    .select({ id: items.id, primaryUnitId: items.primaryUnitId })
    .from(items)
    .where(eq(items.id, data.itemId))
    .limit(1);
  if (!item) {
    return { ok: false, fieldErrors: {}, formError: "itemNotFound" };
  }

  const sourceRow = await getInventoryRow(db, data.itemId, data.variantId, data.fromWarehouseId);
  const sourceCurrentQuantity = sourceRow ? Number(sourceRow.quantity) : 0;

  let warning = null;
  if (sourceCurrentQuantity - data.amount < 0) {
    const action = await getNegativeStockAction(db);
    if (action === 2) {
      return { ok: false, fieldErrors: {}, formError: "insufficientStock" };
    }
    if (action === 1) {
      warning = "stockWentNegative";
    }
  }

  const destinationRow = await getInventoryRow(db, data.itemId, data.variantId, data.toWarehouseId);

  await writeInventoryDelta(db, {
    itemId: data.itemId,
    variantId: data.variantId,
    warehouseId: data.fromWarehouseId,
    unitId: item.primaryUnitId,
    existingRow: sourceRow,
    delta: -data.amount,
    changeType: "transfer_out",
    note: data.note,
  });
  await writeInventoryDelta(db, {
    itemId: data.itemId,
    variantId: data.variantId,
    warehouseId: data.toWarehouseId,
    unitId: item.primaryUnitId,
    existingRow: destinationRow,
    delta: data.amount,
    changeType: "transfer_in",
    note: data.note,
  });

  revalidatePath(`/${companySlug}/items/inventory`);
  return { ok: true, message: "stockTransferCompleted", warning };
}
