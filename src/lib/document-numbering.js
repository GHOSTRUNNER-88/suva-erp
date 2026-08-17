import { eq, sql } from "drizzle-orm";

/**
 * Shared document-numbering primitives for Sales/Purchase/Finance — one
 * implementation, reused by every module's actions.js (see
 * ../../AGENTS.md §5's "single, consistent rule" spirit, applied to
 * numbering the same way it applies to money math — see ./money.js).
 *
 * Ported from legacy's get_next_invoice_number() / get_next_bill_number() /
 * etc. (verified against models/SalesInvoice.php, PurchaseBill.php,
 * DebitNote.php, CreditNote.php, DeliveryChallan.php, Payment.php,
 * Expense.php, SalesOrder.php, SalesQuotation.php, PurchaseOrder.php — all
 * follow the same MAX(id)+1, zero-padded-to-4 shape): invoice/bill/credit-
 * note/debit-note/challan additionally resolve a per-warehouse prefix
 * override (falling back to a fixed default), everything else uses a fixed
 * prefix only. The generated number is always just a *suggestion* — see
 * ../../AGENTS.md §6's numbering note on which document types lock it
 * (invoice/credit-note/debit-note/challan, enforced by the action not
 * accepting a client-supplied number) vs. which stay free-text with an
 * application-level uniqueness check (purchase bill's manual-override,
 * orders/quotations, expense number).
 */

export function padNumber(value, length = 4) {
  return String(value).padStart(length, "0");
}

// Generic MAX(idColumn)+1 — every document type's numbering starts here.
export async function nextSequenceValue(db, table, idColumn) {
  const [row] = await db.select({ maxId: sql`MAX(${idColumn})` }).from(table);
  return Number(row?.maxId ?? 0) + 1;
}

// Resolves the numbering prefix for warehouse-scoped documents: the
// warehouse's own invoicePrefix if it has one set, else the document type's
// fixed default (e.g. "INV", "PB", "DC-prefixed callers pass their own
// infix separately, see nextWarehouseScopedNumber below).
export async function resolveWarehousePrefix(db, warehousesTable, warehouseId, fixedPrefix) {
  if (!warehouseId) return fixedPrefix;
  const [row] = await db
    .select({ prefix: warehousesTable.invoicePrefix })
    .from(warehousesTable)
    .where(eq(warehousesTable.id, Number(warehouseId)))
    .limit(1);
  const prefix = row?.prefix?.trim();
  return prefix ? prefix.toUpperCase() : fixedPrefix;
}

/**
 * Suggests the next number for a warehouse-scoped document — invoice, bill,
 * credit note, debit note, delivery challan. `infix` is delivery challan's
 * extra "-DC-" segment (e.g. prefix "INV", infix "DC" -> "INV-DC-0001");
 * every other document type omits it (prefix "INV" -> "INV-0001").
 */
export async function nextWarehouseScopedNumber(
  db,
  { table, idColumn, warehousesTable, warehouseId, fixedPrefix, infix }
) {
  const nextId = await nextSequenceValue(db, table, idColumn);
  const prefix = await resolveWarehousePrefix(db, warehousesTable, warehouseId, fixedPrefix);
  const body = infix ? `${prefix}-${infix}-${padNumber(nextId)}` : `${prefix}-${padNumber(nextId)}`;
  return body;
}

// Suggests the next number for a fixed-prefix, non-warehouse-scoped
// document — purchase order ("PO-0001"), sales order ("SO-0001"), sales
// quotation ("SQ-0001"), expense ("EXP-0001").
export async function nextFixedPrefixNumber(db, { table, idColumn, prefix }) {
  const nextId = await nextSequenceValue(db, table, idColumn);
  return `${prefix}-${padNumber(nextId)}`;
}
