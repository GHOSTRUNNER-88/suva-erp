"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  attributeValues,
  attributes,
  bankAccounts,
  bankTransactions,
  debitNoteDetails,
  debitNotes,
  items,
  parties,
  settings,
  units,
  warehouses,
} from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { applyInventoryChange, getInventoryRow, getNegativeStockAction } from "@/lib/inventory";
import { calcDocumentTotals, calcLineTotal, round2 } from "@/lib/money";
import { nextWarehouseScopedNumber } from "@/lib/document-numbering";
import { recalculatePartyBalance } from "@/lib/party-ledger";

/**
 * Ported from legacy models/DebitNote.php (APP-REPORT.md §7.2) — a purchase
 * return issued to a supplier: goods physically leave (back to the
 * supplier), so completing a note posts a NEGATIVE inventory delta per
 * line (changeType 'purchase_return', through the same 3-way
 * negative-stock gate as any other stock-out) and always posts the full
 * totalAmount as a Dr entry to the party ledger (supplier owes us) —
 * regardless of isRefunded. A same-time cash refund additionally posts a
 * direct 'debit_note' credit into bank_transactions, separate from and in
 * addition to the party-ledger posting.
 *
 * Unlike purchase bills' billNumber, `debitNoteNumber` is NEVER
 * client-editable — it's in the always-auto-generate group (with invoice/
 * credit-note/challan, see lib/document-numbering.js's numbering note) and
 * is generated server-side at create time only; edits never touch it.
 *
 * recalculatePartyBalance's debit-note sum has NO status filter (a verified
 * legacy quirk — see lib/party-ledger.js) — meaning even a cancelled debit
 * note keeps contributing to the party's Dr balance. Editing/cancelling
 * here still follows the same draft-only-edit / cancel-reverses-effects
 * shape as purchase bills (see purchase/bills/actions.js's file header for
 * why that split exists) — the party-ledger quirk is orthogonal to that and
 * preserved exactly as specified, not "fixed".
 */

function canAccessPurchase(context) {
  return context.accessibleModules.includes("purchase");
}

// Empty-string/undefined/null all normalize to null for an optional foreign
// key select (CreatableSelect's "not selected" state is ""), then a real id
// still has to be a positive integer. Plain `z.coerce.number()...nullable()`
// does NOT do this safely: z.coerce.number() coerces "" to 0 before
// `.nullable()` ever gets a chance to see the empty string, and 0 then fails
// `.positive()` — verified against this project's installed zod (v4).
const optionalId = () =>
  z.preprocess((value) => (value === "" || value == null ? null : value), z.coerce.number().int().positive().nullable());

const lineSchema = z.object({
  itemId: z.coerce.number().int().positive("itemRequired"),
  variantId: optionalId(),
  unitId: z.coerce.number().int().positive("unitRequired"),
  quantity: z.coerce.number().positive("quantityRequired"),
  rate: z.coerce.number().min(0, "somethingWentWrong").default(0),
  discType: z.enum(["percent", "amount"]).default("percent"),
  discValue: z.coerce.number().min(0, "somethingWentWrong").default(0),
});

const debitNoteSchema = z
  .object({
    debitNoteDate: z.string().trim().min(1, "debitNoteDateRequired"),
    partyId: z.coerce.number().int().positive("partyRequired"),
    referenceNo: z.string().trim().max(100).optional().or(z.literal("")),
    supplierName: z.string().trim().max(225).optional().or(z.literal("")),
    supplierAddress: z.string().trim().max(2000).optional().or(z.literal("")),
    warehouseId: z.coerce.number().int().positive("warehouseRequired"),
    discType: z.enum(["percent", "amount"]).default("percent"),
    discValue: z.coerce.number().min(0, "somethingWentWrong").default(0),
    isVatApplicable: z.boolean().default(false),
    vatPercent: z.coerce.number().min(0).max(100).default(0),
    isRefunded: z.boolean().default(false),
    refundAmount: z.coerce.number().min(0, "somethingWentWrong").default(0),
    bankAccountId: optionalId(),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    status: z.enum(["draft", "completed", "cancelled"]).default("completed"),
    lines: z.array(lineSchema).min(1, "atLeastOneLineRequired"),
  })
  .superRefine((data, ctx) => {
    if (data.isRefunded && data.refundAmount > 0 && !data.bankAccountId) {
      ctx.addIssue({ path: ["bankAccountId"], code: z.ZodIssueCode.custom, message: "bankAccountRequiredForRefund" });
    }
  });

function computeDebitNoteTotals(data) {
  const computedLines = data.lines.map((line) => {
    const quantity = Math.round(Number(line.quantity) || 0);
    const totals = calcLineTotal({ quantity, rate: line.rate, discType: line.discType, discValue: line.discValue });
    return { ...line, quantity, ...totals };
  });
  const documentTotals = calcDocumentTotals({
    lines: computedLines,
    discType: data.discType,
    discValue: data.discValue,
    vatPercent: data.vatPercent,
    isVatApplicable: data.isVatApplicable,
  });
  return { computedLines, documentTotals };
}

function debitNoteHeaderValues(data, documentTotals, debitNoteNumber) {
  const effectiveRefund = data.isRefunded ? round2(Math.min(data.refundAmount, documentTotals.totalAmount)) : 0;
  return {
    ...(debitNoteNumber ? { debitNoteNumber } : {}),
    debitNoteDate: data.debitNoteDate,
    partyId: data.partyId,
    referenceNo: data.referenceNo || null,
    supplierName: data.supplierName || null,
    supplierAddress: data.supplierAddress || null,
    warehouseId: data.warehouseId,
    subtotal: documentTotals.subtotal.toFixed(2),
    discType: data.discType,
    discPercent: documentTotals.discPercent.toFixed(2),
    discAmount: documentTotals.discAmount.toFixed(2),
    vatPercent: data.isVatApplicable ? data.vatPercent.toFixed(2) : null,
    isVatApplicable: data.isVatApplicable ? 1 : 0,
    vatAmount: documentTotals.vatAmount.toFixed(2),
    totalAmount: documentTotals.totalAmount.toFixed(2),
    isRefunded: data.isRefunded ? 1 : 0,
    refundAmount: effectiveRefund.toFixed(2),
    bankAccountId: data.isRefunded ? data.bankAccountId || null : null,
    notes: data.notes || null,
    status: data.status,
  };
}

async function insertDebitNoteLines(db, debitNoteId, computedLines) {
  await db.insert(debitNoteDetails).values(
    computedLines.map((line) => ({
      debitNoteId,
      itemId: line.itemId,
      variantId: line.variantId || null,
      unitId: line.unitId,
      quantity: line.quantity.toFixed(2),
      rate: Number(line.rate).toFixed(5),
      discType: line.discType,
      discPercent: line.discPercent.toFixed(2),
      discAmount: line.discAmount.toFixed(2),
      lineSubtotal: line.lineSubtotal.toFixed(2),
      lineTotal: line.lineTotal.toFixed(2),
    }))
  );
}

// Goods leaving (negative delta) can trip the negative-stock gate, unlike a
// purchase bill's always-positive delta — pre-checks every line BEFORE any
// write happens so a blocked line aborts the whole save with nothing
// partially applied (this codebase has no db.transaction() wrapper
// available anywhere else to lean on instead, see file header comment).
async function precheckDebitNoteStock(db, warehouseId, computedLines) {
  const negativeStockAction = await getNegativeStockAction(db);
  if (negativeStockAction !== 2) return { blocked: false };
  for (const line of computedLines) {
    const variantId = line.variantId || 0;
    const row = await getInventoryRow(db, line.itemId, variantId, warehouseId);
    const current = row ? Number(row.quantity) : 0;
    if (current - line.quantity < 0) {
      return { blocked: true };
    }
  }
  return { blocked: false };
}

async function applyDebitNoteInventory(db, warehouseId, computedLines) {
  for (const line of computedLines) {
    await applyInventoryChange(db, {
      itemId: line.itemId,
      variantId: line.variantId || 0,
      warehouseId,
      unitId: line.unitId,
      delta: -line.quantity,
      changeType: "purchase_return",
      note: null,
    });
  }
}

async function reverseDebitNoteInventory(db, warehouseId, lines) {
  for (const line of lines) {
    await applyInventoryChange(db, {
      itemId: line.itemId,
      variantId: line.variantId || 0,
      warehouseId,
      unitId: line.unitId,
      delta: Number(line.quantity),
      changeType: "purchase_return",
      note: "Cancelled debit note",
    });
  }
}

export async function listDebitNotes(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({
      id: debitNotes.id,
      debitNoteNumber: debitNotes.debitNoteNumber,
      debitNoteDate: debitNotes.debitNoteDate,
      partyId: debitNotes.partyId,
      partyName: parties.name,
      warehouseId: debitNotes.warehouseId,
      warehouseName: warehouses.name,
      totalAmount: debitNotes.totalAmount,
      isRefunded: debitNotes.isRefunded,
      status: debitNotes.status,
      createdAt: debitNotes.createdAt,
    })
    .from(debitNotes)
    .innerJoin(parties, eq(debitNotes.partyId, parties.id))
    .leftJoin(warehouses, eq(debitNotes.warehouseId, warehouses.id))
    .orderBy(desc(debitNotes.id));
}

export async function getDebitNoteDetail(companySlug, debitNoteId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const id = Number(debitNoteId);

  const [debitNote] = await db
    .select({
      id: debitNotes.id,
      debitNoteNumber: debitNotes.debitNoteNumber,
      debitNoteDate: debitNotes.debitNoteDate,
      partyId: debitNotes.partyId,
      partyName: parties.name,
      referenceNo: debitNotes.referenceNo,
      supplierName: debitNotes.supplierName,
      supplierAddress: debitNotes.supplierAddress,
      warehouseId: debitNotes.warehouseId,
      warehouseName: warehouses.name,
      bankAccountId: debitNotes.bankAccountId,
      bankAccountName: bankAccounts.bankName,
      subtotal: debitNotes.subtotal,
      discType: debitNotes.discType,
      discPercent: debitNotes.discPercent,
      discAmount: debitNotes.discAmount,
      vatPercent: debitNotes.vatPercent,
      isVatApplicable: debitNotes.isVatApplicable,
      vatAmount: debitNotes.vatAmount,
      totalAmount: debitNotes.totalAmount,
      isRefunded: debitNotes.isRefunded,
      refundAmount: debitNotes.refundAmount,
      notes: debitNotes.notes,
      status: debitNotes.status,
      createdAt: debitNotes.createdAt,
    })
    .from(debitNotes)
    .innerJoin(parties, eq(debitNotes.partyId, parties.id))
    .leftJoin(warehouses, eq(debitNotes.warehouseId, warehouses.id))
    .leftJoin(bankAccounts, eq(debitNotes.bankAccountId, bankAccounts.id))
    .where(eq(debitNotes.id, id))
    .limit(1);
  if (!debitNote) return null;

  const lines = await db
    .select({
      id: debitNoteDetails.id,
      itemId: debitNoteDetails.itemId,
      itemName: items.name,
      variantId: debitNoteDetails.variantId,
      variantName: attributeValues.name,
      unitId: debitNoteDetails.unitId,
      unitCode: units.code,
      quantity: debitNoteDetails.quantity,
      rate: debitNoteDetails.rate,
      discType: debitNoteDetails.discType,
      discPercent: debitNoteDetails.discPercent,
      discAmount: debitNoteDetails.discAmount,
      lineSubtotal: debitNoteDetails.lineSubtotal,
      lineTotal: debitNoteDetails.lineTotal,
    })
    .from(debitNoteDetails)
    .innerJoin(items, eq(debitNoteDetails.itemId, items.id))
    .innerJoin(units, eq(debitNoteDetails.unitId, units.id))
    .leftJoin(attributeValues, eq(debitNoteDetails.variantId, attributeValues.id))
    .where(eq(debitNoteDetails.debitNoteId, id));

  return { debitNote, lines };
}

export async function getDebitNoteFormData(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const secondaryUnits = alias(units, "secondary_units");

  const [partyRows, warehouseRows, itemRows, unitRows, attributeValueRows, bankAccountRows, [settingsRow]] = await Promise.all([
    db
      .select({ id: parties.id, name: parties.name, type: parties.type, address: parties.address, panNumber: parties.panNumber })
      .from(parties)
      .where(inArray(parties.type, ["Supplier", "Both"])),
    db.select({ id: warehouses.id, name: warehouses.name }).from(warehouses),
    db
      .select({
        id: items.id,
        name: items.name,
        primaryUnitId: items.primaryUnitId,
        primaryUnitCode: units.code,
        secondaryUnitId: items.secondaryUnitId,
        secondaryUnitCode: secondaryUnits.code,
        purchasePrice: items.purchasePrice,
      })
      .from(items)
      .innerJoin(units, eq(items.primaryUnitId, units.id))
      .leftJoin(secondaryUnits, eq(items.secondaryUnitId, secondaryUnits.id)),
    db.select({ id: units.id, name: units.name, code: units.code }).from(units),
    db
      .select({ id: attributeValues.id, name: attributeValues.name, attributeName: attributes.name })
      .from(attributeValues)
      .innerJoin(attributes, eq(attributeValues.attrId, attributes.id)),
    db
      .select({ id: bankAccounts.id, bankName: bankAccounts.bankName, displayName: bankAccounts.displayName })
      .from(bankAccounts)
      .where(eq(bankAccounts.status, "active")),
    db.select({ defaultVatEnabled: settings.defaultVatEnabled, defaultVatPercent: settings.defaultVatPercent }).from(settings).limit(1),
  ]);

  return {
    parties: partyRows,
    warehouses: warehouseRows,
    items: itemRows,
    units: unitRows,
    attributeValues: attributeValueRows,
    bankAccounts: bankAccountRows,
    defaultVatEnabled: settingsRow?.defaultVatEnabled === 1,
    defaultVatPercent: Number(settingsRow?.defaultVatPercent ?? 13),
  };
}

export async function createDebitNoteAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = debitNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);
  const { computedLines, documentTotals } = computeDebitNoteTotals(data);

  if (data.status === "completed") {
    const { blocked } = await precheckDebitNoteStock(db, data.warehouseId, computedLines);
    if (blocked) {
      return { ok: false, fieldErrors: {}, formError: "insufficientStock" };
    }
  }

  // Always server-generated, never client-supplied — see file header
  // comment on why debitNoteNumber is in the "always auto-generate" group.
  const debitNoteNumber = await nextWarehouseScopedNumber(db, {
    table: debitNotes,
    idColumn: debitNotes.id,
    warehousesTable: warehouses,
    warehouseId: data.warehouseId,
    fixedPrefix: "DN",
  });

  const [{ id: debitNoteId }] = await db
    .insert(debitNotes)
    .values(debitNoteHeaderValues(data, documentTotals, debitNoteNumber))
    .$returningId();
  await insertDebitNoteLines(db, debitNoteId, computedLines);

  if (data.status === "completed") {
    await applyDebitNoteInventory(db, data.warehouseId, computedLines);

    const effectiveRefund = data.isRefunded ? round2(Math.min(data.refundAmount, documentTotals.totalAmount)) : 0;
    if (data.isRefunded && data.bankAccountId && effectiveRefund > 0) {
      await db.insert(bankTransactions).values({
        bankAccountId: data.bankAccountId,
        txnDate: data.debitNoteDate,
        txnType: "credit",
        transactionType: "debit_note",
        transactionRefId: debitNoteId,
        amount: effectiveRefund.toFixed(2),
        referenceNo: debitNoteNumber,
        note: `Debit note ${debitNoteNumber}`,
      });
    }
  }

  // No status filter on this call's contribution — the legacy quirk lives
  // inside recalculatePartyBalance itself (see lib/party-ledger.js), not
  // here.
  await recalculatePartyBalance(db, data.partyId);

  revalidatePath(`/${companySlug}/purchase/debit-notes`);
  return { ok: true, message: "debitNoteCreated", id: debitNoteId };
}

export async function updateDebitNoteAction(companySlug, debitNoteId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = debitNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(debitNoteId);
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db.select({ id: debitNotes.id, status: debitNotes.status, partyId: debitNotes.partyId }).from(debitNotes).where(eq(debitNotes.id, id)).limit(1);
  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "debitNoteNotFound" };
  }
  // Same draft-only-edit restriction as purchase bills — see that module's
  // file header comment for why.
  if (existing.status !== "draft") {
    return { ok: false, fieldErrors: {}, formError: "cannotEditPostedDocument" };
  }

  const { computedLines, documentTotals } = computeDebitNoteTotals(data);

  if (data.status === "completed") {
    const { blocked } = await precheckDebitNoteStock(db, data.warehouseId, computedLines);
    if (blocked) {
      return { ok: false, fieldErrors: {}, formError: "insufficientStock" };
    }
  }

  // debitNoteNumber is never touched on update — it was already generated
  // once at creation (see file header comment).
  await db.update(debitNotes).set(debitNoteHeaderValues(data, documentTotals, null)).where(eq(debitNotes.id, id));
  await db.delete(debitNoteDetails).where(eq(debitNoteDetails.debitNoteId, id));
  await insertDebitNoteLines(db, id, computedLines);

  if (data.status === "completed") {
    await applyDebitNoteInventory(db, data.warehouseId, computedLines);

    const effectiveRefund = data.isRefunded ? round2(Math.min(data.refundAmount, documentTotals.totalAmount)) : 0;
    if (data.isRefunded && data.bankAccountId && effectiveRefund > 0) {
      const [current] = await db.select({ debitNoteNumber: debitNotes.debitNoteNumber }).from(debitNotes).where(eq(debitNotes.id, id)).limit(1);
      await db.insert(bankTransactions).values({
        bankAccountId: data.bankAccountId,
        txnDate: data.debitNoteDate,
        txnType: "credit",
        transactionType: "debit_note",
        transactionRefId: id,
        amount: effectiveRefund.toFixed(2),
        referenceNo: current?.debitNoteNumber ?? "",
        note: `Debit note ${current?.debitNoteNumber ?? ""}`,
      });
    }
  }

  await recalculatePartyBalance(db, data.partyId);

  revalidatePath(`/${companySlug}/purchase/debit-notes`);
  revalidatePath(`/${companySlug}/purchase/debit-notes/${id}`);
  return { ok: true, message: "debitNoteUpdated" };
}

// Reverses inventory (positive delta, restoring stock) and deletes the
// refund bank_transactions row, then recomputes the party balance — the
// note keeps contributing to the ledger sum regardless (no status filter,
// see file header comment), so recalculatePartyBalance's result here is
// unchanged by the cancellation itself, only by the reversed inventory/bank
// side effects.
export async function cancelDebitNoteAction(companySlug, debitNoteId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const id = Number(debitNoteId);
  const db = getOrganizationDb(context.session.organizationDbName);

  const [debitNote] = await db
    .select({ id: debitNotes.id, status: debitNotes.status, partyId: debitNotes.partyId, warehouseId: debitNotes.warehouseId })
    .from(debitNotes)
    .where(eq(debitNotes.id, id))
    .limit(1);
  if (!debitNote) {
    return { ok: false, formError: "debitNoteNotFound" };
  }
  if (debitNote.status === "cancelled") {
    return { ok: false, formError: "alreadyCancelled" };
  }

  if (debitNote.status === "completed") {
    const lines = await db
      .select({ itemId: debitNoteDetails.itemId, variantId: debitNoteDetails.variantId, unitId: debitNoteDetails.unitId, quantity: debitNoteDetails.quantity })
      .from(debitNoteDetails)
      .where(eq(debitNoteDetails.debitNoteId, id));
    if (debitNote.warehouseId) {
      await reverseDebitNoteInventory(db, debitNote.warehouseId, lines);
    }
    await db.delete(bankTransactions).where(and(eq(bankTransactions.transactionType, "debit_note"), eq(bankTransactions.transactionRefId, id)));
  }

  await db.update(debitNotes).set({ status: "cancelled" }).where(eq(debitNotes.id, id));
  await recalculatePartyBalance(db, debitNote.partyId);

  revalidatePath(`/${companySlug}/purchase/debit-notes`);
  revalidatePath(`/${companySlug}/purchase/debit-notes/${id}`);
  return { ok: true, message: "debitNoteCancelled" };
}

export async function deleteDebitNoteDraftsAction(companySlug, debitNoteIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const ids = (Array.isArray(debitNoteIds) ? debitNoteIds : [debitNoteIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) {
    return { ok: false, formError: "debitNoteNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  const rows = await db.select({ id: debitNotes.id, status: debitNotes.status }).from(debitNotes).where(inArray(debitNotes.id, ids));
  const draftIds = rows.filter((row) => row.status === "draft").map((row) => row.id);
  if (draftIds.length === 0) {
    return { ok: false, formError: "onlyDraftsCanBeDeleted" };
  }

  await db.delete(debitNotes).where(inArray(debitNotes.id, draftIds));

  revalidatePath(`/${companySlug}/purchase/debit-notes`);
  return { ok: true, message: "debitNotesDeleted", count: draftIds.length };
}
