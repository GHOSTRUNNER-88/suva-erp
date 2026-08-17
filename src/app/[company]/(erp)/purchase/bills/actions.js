"use server";

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  attributeValues,
  attributes,
  bankAccounts,
  bankTransactions,
  items,
  parties,
  purchaseBillDetails,
  purchaseBills,
  settings,
  units,
  warehouses,
} from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { applyInventoryChange } from "@/lib/inventory";
import { calcDocumentTotals, calcLineTotal, round2 } from "@/lib/money";
import { nextWarehouseScopedNumber } from "@/lib/document-numbering";
import { recalculatePartyBalance } from "@/lib/party-ledger";

/**
 * Ported from legacy models/PurchaseBill.php (APP-REPORT.md §7.2, mirror of
 * SalesInvoice.php) — verified in full. Completing a bill (status
 * 'completed', the default) increases inventory for every line and always
 * posts the full totalAmount as a Cr entry to the party ledger (we owe the
 * supplier) regardless of isPaid/paidAmount; a same-time payment
 * additionally posts a direct 'purchase' debit into bank_transactions,
 * separate from and in addition to the party-ledger posting (mirrors
 * SalesInvoice's isReceived -> bank_transactions('sales') path). Cancelling
 * reverses inventory, deletes that bank_transactions row, and recomputes
 * the party balance — the row itself is kept (status='cancelled'), not hard
 * deleted, for the audit trail.
 *
 * `billNumber` auto-suggests via nextWarehouseScopedNumber but is a MANUAL
 * OVERRIDE the user can always retype (to record the supplier's own VAT
 * bill number) — uniqueness is an application-level check, same as orders'
 * orderNumber (see lib/document-numbering.js's numbering note).
 *
 * Editing is only allowed while a bill is still 'draft' — once 'completed'
 * it has already posted inventory/ledger/bank effects, and legacy has no
 * "edit a posted invoice" flow (only cancel). This is a judgment call, not
 * an explicitly documented legacy behavior — see the task's final report.
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

const billSchema = z
  .object({
    billNumber: z.string().trim().min(1, "billNumberRequired").max(50, "billNumberTooLong"),
    billDate: z.string().trim().min(1, "billDateRequired"),
    partyId: z.coerce.number().int().positive("partyRequired"),
    supplierName: z.string().trim().max(225).optional().or(z.literal("")),
    supplierAddress: z.string().trim().max(2000).optional().or(z.literal("")),
    panNumber: z.string().trim().max(50).optional().or(z.literal("")),
    bankAccountId: optionalId(),
    warehouseId: z.coerce.number().int().positive("warehouseRequired"),
    discType: z.enum(["percent", "amount"]).default("percent"),
    discValue: z.coerce.number().min(0, "somethingWentWrong").default(0),
    isVatApplicable: z.boolean().default(false),
    vatPercent: z.coerce.number().min(0).max(100).default(0),
    isPaid: z.boolean().default(false),
    paidAmount: z.coerce.number().min(0, "somethingWentWrong").default(0),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    status: z.enum(["draft", "completed", "cancelled"]).default("completed"),
    lines: z.array(lineSchema).min(1, "atLeastOneLineRequired"),
  })
  .superRefine((data, ctx) => {
    if (data.isPaid && data.paidAmount > 0 && !data.bankAccountId) {
      ctx.addIssue({ path: ["bankAccountId"], code: z.ZodIssueCode.custom, message: "bankAccountRequiredForPayment" });
    }
  });

async function billNumberExists(db, billNumber, exceptId) {
  const where = exceptId
    ? and(eq(purchaseBills.billNumber, billNumber), ne(purchaseBills.id, exceptId))
    : eq(purchaseBills.billNumber, billNumber);
  const existing = await db.select({ id: purchaseBills.id }).from(purchaseBills).where(where).limit(1);
  return existing.length > 0;
}

function computeBillTotals(data) {
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

function billHeaderValues(data, documentTotals) {
  // Paid/due are only meaningful when isPaid is actually set — an unpaid
  // bill's paidAmount is forced to 0 rather than trusting a stray form
  // value, so dueAmount always equals totalAmount for it.
  const effectivePaid = data.isPaid ? round2(Math.min(data.paidAmount, documentTotals.totalAmount)) : 0;
  const dueAmount = round2(documentTotals.totalAmount - effectivePaid);
  return {
    billNumber: data.billNumber,
    billDate: data.billDate,
    partyId: data.partyId,
    supplierName: data.supplierName || null,
    supplierAddress: data.supplierAddress || null,
    panNumber: data.panNumber || null,
    bankAccountId: data.isPaid ? data.bankAccountId || null : null,
    warehouseId: data.warehouseId,
    subtotal: documentTotals.subtotal.toFixed(2),
    discType: data.discType,
    discPercent: documentTotals.discPercent.toFixed(2),
    discAmount: documentTotals.discAmount.toFixed(2),
    vatPercent: data.isVatApplicable ? data.vatPercent.toFixed(2) : null,
    isVatApplicable: data.isVatApplicable ? 1 : 0,
    vatAmount: documentTotals.vatAmount.toFixed(2),
    totalAmount: documentTotals.totalAmount.toFixed(2),
    isPaid: data.isPaid ? 1 : 0,
    paidAmount: effectivePaid.toFixed(2),
    dueAmount: dueAmount.toFixed(2),
    notes: data.notes || null,
    status: data.status,
  };
}

async function insertBillLines(db, billId, computedLines) {
  await db.insert(purchaseBillDetails).values(
    computedLines.map((line) => ({
      billId,
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

// Purchases only ever add stock (positive delta), so applyInventoryChange's
// negative-stock gate never triggers here — unlike debit notes, no
// pre-check is needed before writing.
async function applyBillInventory(db, warehouseId, computedLines) {
  for (const line of computedLines) {
    await applyInventoryChange(db, {
      itemId: line.itemId,
      variantId: line.variantId || 0,
      warehouseId,
      unitId: line.unitId,
      delta: line.quantity,
      changeType: "purchase",
      note: null,
    });
  }
}

async function reverseBillInventory(db, warehouseId, lines) {
  for (const line of lines) {
    await applyInventoryChange(db, {
      itemId: line.itemId,
      variantId: line.variantId || 0,
      warehouseId,
      unitId: line.unitId,
      delta: -Number(line.quantity),
      changeType: "purchase",
      note: "Cancelled purchase bill",
    });
  }
}

export async function listPurchaseBills(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({
      id: purchaseBills.id,
      billNumber: purchaseBills.billNumber,
      billDate: purchaseBills.billDate,
      partyId: purchaseBills.partyId,
      partyName: parties.name,
      warehouseId: purchaseBills.warehouseId,
      warehouseName: warehouses.name,
      totalAmount: purchaseBills.totalAmount,
      dueAmount: purchaseBills.dueAmount,
      isPaid: purchaseBills.isPaid,
      status: purchaseBills.status,
      createdAt: purchaseBills.createdAt,
    })
    .from(purchaseBills)
    .innerJoin(parties, eq(purchaseBills.partyId, parties.id))
    .leftJoin(warehouses, eq(purchaseBills.warehouseId, warehouses.id))
    .orderBy(desc(purchaseBills.id));
}

export async function getPurchaseBillDetail(companySlug, billId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const id = Number(billId);

  const [bill] = await db
    .select({
      id: purchaseBills.id,
      billNumber: purchaseBills.billNumber,
      billDate: purchaseBills.billDate,
      partyId: purchaseBills.partyId,
      partyName: parties.name,
      supplierName: purchaseBills.supplierName,
      supplierAddress: purchaseBills.supplierAddress,
      panNumber: purchaseBills.panNumber,
      bankAccountId: purchaseBills.bankAccountId,
      bankAccountName: bankAccounts.bankName,
      warehouseId: purchaseBills.warehouseId,
      warehouseName: warehouses.name,
      subtotal: purchaseBills.subtotal,
      discType: purchaseBills.discType,
      discPercent: purchaseBills.discPercent,
      discAmount: purchaseBills.discAmount,
      vatPercent: purchaseBills.vatPercent,
      isVatApplicable: purchaseBills.isVatApplicable,
      vatAmount: purchaseBills.vatAmount,
      totalAmount: purchaseBills.totalAmount,
      isPaid: purchaseBills.isPaid,
      paidAmount: purchaseBills.paidAmount,
      dueAmount: purchaseBills.dueAmount,
      notes: purchaseBills.notes,
      status: purchaseBills.status,
      createdAt: purchaseBills.createdAt,
    })
    .from(purchaseBills)
    .innerJoin(parties, eq(purchaseBills.partyId, parties.id))
    .leftJoin(warehouses, eq(purchaseBills.warehouseId, warehouses.id))
    .leftJoin(bankAccounts, eq(purchaseBills.bankAccountId, bankAccounts.id))
    .where(eq(purchaseBills.id, id))
    .limit(1);
  if (!bill) return null;

  const lines = await db
    .select({
      id: purchaseBillDetails.id,
      itemId: purchaseBillDetails.itemId,
      itemName: items.name,
      variantId: purchaseBillDetails.variantId,
      variantName: attributeValues.name,
      unitId: purchaseBillDetails.unitId,
      unitCode: units.code,
      quantity: purchaseBillDetails.quantity,
      rate: purchaseBillDetails.rate,
      discType: purchaseBillDetails.discType,
      discPercent: purchaseBillDetails.discPercent,
      discAmount: purchaseBillDetails.discAmount,
      lineSubtotal: purchaseBillDetails.lineSubtotal,
      lineTotal: purchaseBillDetails.lineTotal,
    })
    .from(purchaseBillDetails)
    .innerJoin(items, eq(purchaseBillDetails.itemId, items.id))
    .innerJoin(units, eq(purchaseBillDetails.unitId, units.id))
    .leftJoin(attributeValues, eq(purchaseBillDetails.variantId, attributeValues.id))
    .where(eq(purchaseBillDetails.billId, id));

  return { bill, lines };
}

export async function getPurchaseBillFormData(companySlug, warehouseIdForNumber) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const secondaryUnits = alias(units, "secondary_units");

  const [partyRows, warehouseRows, itemRows, unitRows, attributeValueRows, bankAccountRows, [settingsRow], suggestedBillNumber] =
    await Promise.all([
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
      nextWarehouseScopedNumber(db, {
        table: purchaseBills,
        idColumn: purchaseBills.id,
        warehousesTable: warehouses,
        warehouseId: warehouseIdForNumber || null,
        fixedPrefix: "PB",
      }),
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
    suggestedBillNumber,
  };
}

// Re-suggests the bill number once the user picks/changes the warehouse on
// the create form (the suggested prefix is warehouse-scoped) — called from
// the client, not baked into the initial server-rendered form data alone.
export async function suggestPurchaseBillNumber(companySlug, warehouseId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) return "";
  const db = getOrganizationDb(context.session.organizationDbName);
  return nextWarehouseScopedNumber(db, {
    table: purchaseBills,
    idColumn: purchaseBills.id,
    warehousesTable: warehouses,
    warehouseId: warehouseId || null,
    fixedPrefix: "PB",
  });
}

export async function createPurchaseBillAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = billSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  if (await billNumberExists(db, data.billNumber)) {
    return { ok: false, fieldErrors: { billNumber: ["billNumberExists"] } };
  }

  const { computedLines, documentTotals } = computeBillTotals(data);

  const [{ id: billId }] = await db.insert(purchaseBills).values(billHeaderValues(data, documentTotals)).$returningId();
  await insertBillLines(db, billId, computedLines);

  if (data.status === "completed") {
    await applyBillInventory(db, data.warehouseId, computedLines);

    const effectivePaid = data.isPaid ? round2(Math.min(data.paidAmount, documentTotals.totalAmount)) : 0;
    if (data.isPaid && data.bankAccountId && effectivePaid > 0) {
      await db.insert(bankTransactions).values({
        bankAccountId: data.bankAccountId,
        txnDate: data.billDate,
        txnType: "debit",
        transactionType: "purchase",
        transactionRefId: billId,
        amount: effectivePaid.toFixed(2),
        referenceNo: data.billNumber,
        note: `Purchase bill ${data.billNumber}`,
      });
    }

    await recalculatePartyBalance(db, data.partyId);
  }

  revalidatePath(`/${companySlug}/purchase/bills`);
  return { ok: true, message: "purchaseBillCreated", id: billId };
}

export async function updatePurchaseBillAction(companySlug, billId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = billSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(billId);
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db.select({ id: purchaseBills.id, status: purchaseBills.status }).from(purchaseBills).where(eq(purchaseBills.id, id)).limit(1);
  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "purchaseBillNotFound" };
  }
  // Only a draft can be freely edited — a completed bill has already posted
  // inventory/ledger/bank effects, so editing it in place would require
  // reversing and reapplying all three; legacy has no such flow, only
  // cancel. See file header comment.
  if (existing.status !== "draft") {
    return { ok: false, fieldErrors: {}, formError: "cannotEditPostedDocument" };
  }
  if (await billNumberExists(db, data.billNumber, id)) {
    return { ok: false, fieldErrors: { billNumber: ["billNumberExists"] } };
  }

  const { computedLines, documentTotals } = computeBillTotals(data);

  await db.update(purchaseBills).set(billHeaderValues(data, documentTotals)).where(eq(purchaseBills.id, id));
  await db.delete(purchaseBillDetails).where(eq(purchaseBillDetails.billId, id));
  await insertBillLines(db, id, computedLines);

  if (data.status === "completed") {
    await applyBillInventory(db, data.warehouseId, computedLines);

    const effectivePaid = data.isPaid ? round2(Math.min(data.paidAmount, documentTotals.totalAmount)) : 0;
    if (data.isPaid && data.bankAccountId && effectivePaid > 0) {
      await db.insert(bankTransactions).values({
        bankAccountId: data.bankAccountId,
        txnDate: data.billDate,
        txnType: "debit",
        transactionType: "purchase",
        transactionRefId: id,
        amount: effectivePaid.toFixed(2),
        referenceNo: data.billNumber,
        note: `Purchase bill ${data.billNumber}`,
      });
    }

    await recalculatePartyBalance(db, data.partyId);
  }

  revalidatePath(`/${companySlug}/purchase/bills`);
  revalidatePath(`/${companySlug}/purchase/bills/${id}`);
  return { ok: true, message: "purchaseBillUpdated" };
}

// Reverses everything a 'completed' bill posted — inventory, the bank
// payment row, and the party balance — and keeps the row itself
// (status='cancelled') for the audit trail, matching the brief exactly.
export async function cancelPurchaseBillAction(companySlug, billId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const id = Number(billId);
  const db = getOrganizationDb(context.session.organizationDbName);

  const [bill] = await db
    .select({ id: purchaseBills.id, status: purchaseBills.status, partyId: purchaseBills.partyId, warehouseId: purchaseBills.warehouseId })
    .from(purchaseBills)
    .where(eq(purchaseBills.id, id))
    .limit(1);
  if (!bill) {
    return { ok: false, formError: "purchaseBillNotFound" };
  }
  if (bill.status === "cancelled") {
    return { ok: false, formError: "alreadyCancelled" };
  }

  if (bill.status === "completed") {
    const lines = await db
      .select({ itemId: purchaseBillDetails.itemId, variantId: purchaseBillDetails.variantId, unitId: purchaseBillDetails.unitId, quantity: purchaseBillDetails.quantity })
      .from(purchaseBillDetails)
      .where(eq(purchaseBillDetails.billId, id));
    if (bill.warehouseId) {
      await reverseBillInventory(db, bill.warehouseId, lines);
    }
    await db.delete(bankTransactions).where(and(eq(bankTransactions.transactionType, "purchase"), eq(bankTransactions.transactionRefId, id)));
  }

  await db.update(purchaseBills).set({ status: "cancelled" }).where(eq(purchaseBills.id, id));
  await recalculatePartyBalance(db, bill.partyId);

  revalidatePath(`/${companySlug}/purchase/bills`);
  revalidatePath(`/${companySlug}/purchase/bills/${id}`);
  return { ok: true, message: "purchaseBillCancelled" };
}

export async function deletePurchaseBillDraftsAction(companySlug, billIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const ids = (Array.isArray(billIds) ? billIds : [billIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) {
    return { ok: false, formError: "purchaseBillNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  const rows = await db.select({ id: purchaseBills.id, status: purchaseBills.status }).from(purchaseBills).where(inArray(purchaseBills.id, ids));
  // Only drafts can be hard-deleted — a completed/cancelled bill already
  // has (or had) real inventory/ledger effects and must go through Cancel
  // instead, keeping its audit-trail row.
  const draftIds = rows.filter((row) => row.status === "draft").map((row) => row.id);
  if (draftIds.length === 0) {
    return { ok: false, formError: "onlyDraftsCanBeDeleted" };
  }

  await db.delete(purchaseBills).where(inArray(purchaseBills.id, draftIds));

  revalidatePath(`/${companySlug}/purchase/bills`);
  return { ok: true, message: "purchaseBillsDeleted", count: draftIds.length };
}
