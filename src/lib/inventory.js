import { and, eq } from "drizzle-orm";
import { inventories, inventoryTransactions, settings } from "@/db/schema/organization";

/**
 * Shared inventory-mutation core — extracted out of
 * items/inventory/actions.js so every Sales/Purchase module can reuse the
 * exact same stock-write + negative-stock-gate + audit-trail logic (see
 * ../../AGENTS.md §5/§7: one shared rule, not reimplemented per module).
 *
 * Deliberately NOT a "use server" file: a "use server" file's every export
 * becomes a client-callable RPC endpoint with no auth check of its own, and
 * this module's functions take raw itemId/warehouseId/delta with no
 * permission check — safe to call from another server action that has
 * already authenticated the caller, unsafe to expose directly. Every module
 * importing this must do its own getAuthenticatedAppContext/accessibleModules
 * check first, same as items/inventory/actions.js already does.
 *
 * Ported from legacy models/Inventory.php's adjust_inventory()/set_inventory()
 * (verified in full) — same 3-way negative_stock_action gate (0=allow,
 * 1=warn, 2=block), same upsert-by-(item,variant,warehouse) shape.
 */

export async function getInventoryRow(db, itemId, variantId, warehouseId) {
  const [row] = await db
    .select({ id: inventories.id, quantity: inventories.quantity })
    .from(inventories)
    .where(and(eq(inventories.itemId, itemId), eq(inventories.variantId, variantId), eq(inventories.warehouseId, warehouseId)))
    .limit(1);
  return row ?? null;
}

export async function getNegativeStockAction(db) {
  const [settingsRow] = await db.select({ negativeStockAction: settings.negativeStockAction }).from(settings).limit(1);
  return settingsRow?.negativeStockAction ?? 1;
}

// Applies `delta` to one (item, variant, warehouse) row, upserting it if
// missing, and logs a matching inventoryTransactions audit row — the stock
// ledger's only writer, so every qty change (from any module) is always
// paired with an audit entry. No negative-stock gating here — callers that
// can ever go negative (any "remove"-shaped delta) must gate via
// applyInventoryChange below or replicate its check themselves.
export async function writeInventoryDelta(db, { itemId, variantId, warehouseId, unitId, existingRow, delta, changeType, note }) {
  const currentQuantity = existingRow ? Number(existingRow.quantity) : 0;
  const newQuantityNumber = currentQuantity + delta;
  const newQuantity = newQuantityNumber.toFixed(4);
  if (existingRow) {
    await db.update(inventories).set({ quantity: newQuantity, unitId }).where(eq(inventories.id, existingRow.id));
  } else {
    await db.insert(inventories).values({ itemId, variantId, warehouseId, unitId, quantity: newQuantity });
  }
  await db.insert(inventoryTransactions).values({
    itemId,
    variantId,
    warehouseId,
    changeType,
    quantityChange: delta.toFixed(4),
    quantityAfter: newQuantity,
    note: note || null,
  });
}

/**
 * The one entry point every Sales/Purchase module should call for a stock
 * effect: looks up the current row, gates negative-stock deltas by the
 * organization's negativeStockAction setting, and writes the delta + audit
 * row. Returns `{ ok: false, insufficientStock: true }` when action=2
 * (block) and the projected quantity would go negative — the caller should
 * surface that as a form error and abort the whole document save (matching
 * legacy's InsufficientStockException aborting the entire transaction).
 * Returns `{ ok: true, warning: "stockWentNegative" }` when action=1 (warn)
 * so the caller can still show a toast after a successful save.
 */
export async function applyInventoryChange(db, { itemId, variantId, warehouseId, unitId, delta, changeType, note }) {
  const existingRow = await getInventoryRow(db, itemId, variantId, warehouseId);
  const currentQuantity = existingRow ? Number(existingRow.quantity) : 0;

  let warning = null;
  if (delta < 0 && currentQuantity + delta < 0) {
    const action = await getNegativeStockAction(db);
    if (action === 2) {
      return { ok: false, insufficientStock: true };
    }
    if (action === 1) {
      warning = "stockWentNegative";
    }
  }

  await writeInventoryDelta(db, { itemId, variantId, warehouseId, unitId, existingRow, delta, changeType, note });
  return { ok: true, warning };
}
