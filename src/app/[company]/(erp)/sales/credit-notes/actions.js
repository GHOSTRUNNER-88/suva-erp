"use server";

import { alias } from "drizzle-orm/mysql-core";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  attributeValues,
  attributes,
  bankAccounts,
  bankTransactions,
  creditNoteDetails,
  creditNotes,
  itemAttributeValues,
  itemPartyGroupPrices,
  items,
  parties,
  settings,
  units,
  warehouses,
} from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { nextWarehouseScopedNumber } from "@/lib/document-numbering";
import { applyInventoryChange } from "@/lib/inventory";
import { calcDocumentTotals, calcLineTotal, round2 } from "@/lib/money";
import { recalculatePartyBalance } from "@/lib/party-ledger";
import { z } from "zod";

/**
 * Ported from legacy models/CreditNote.php (mirrors SalesInvoice.php's
 * relationship to purchases — see ../invoices/actions.js's header comment
 * and this task's brief). Two credit note types:
 * - "sales_return": goods physically come back — increases inventory.
 * - "price_protection": a price adjustment only, no goods movement — must
 *   NEVER call applyInventoryChange.
 * Always posts the full totalAmount as a Cr entry to the party ledger
 * (we owe them), regardless of isRefunded; an actual refund additionally
 * posts a direct debit into bankTransactions, separate from that ledger
 * posting.
 *
 * The task brief spells out create/cancel rules for credit notes in detail
 * but not edit — the edit flow below is extrapolated as the natural mirror
 * of the invoice's edit flow (reverse old effects using the OLD type/
 * warehouse, replace lines, apply new effects gated by the NEW type),
 * flagged here and in the final report rather than silently assumed.
 *
 * Lookup queries below intentionally duplicate ../invoices/actions.js's
 * shape rather than importing from it — keeps the two sibling modules
 * independent so parallel edits to either never touch the other's file.
 */

const FIXED_PREFIX = "CN";

// Empty-string/undefined/null all normalize to null for an optional foreign
// key select (CreatableSelect's "not selected" state is ""), then a real id
// still has to be a positive integer. Plain `z.coerce.number()...nullable()`
// does NOT do this safely: z.coerce.number() coerces "" to 0 before
// `.nullable()` ever gets a chance to see the empty string, and 0 then fails
// `.positive()` — verified against this project's installed zod (v4).
const optionalId = () =>
  z.preprocess((value) => (value === "" || value == null ? null : value), z.coerce.number().int().positive().nullable());

const lineItemSchema = z.object({
  itemId: z.coerce.number().int().positive(),
  variantId: optionalId(),
  unitId: z.coerce.number().int().positive(),
  quantity: z.coerce.number(),
  rate: z.coerce.number().min(0),
  discType: z.enum(["percent", "amount"]).default("percent"),
  discValue: z.coerce.number().min(0).default(0),
});

const creditNoteSchema = z
  .object({
    creditNoteDate: z.string().trim().min(1, "creditNoteDateRequired"),
    creditNoteType: z.enum(["sales_return", "price_protection"]).default("sales_return"),
    partyId: z.coerce.number().int().positive("partyRequired"),
    referenceNo: z.string().trim().max(100).optional().or(z.literal("")),
    billingName: z.string().trim().max(225).optional().or(z.literal("")),
    billingAddress: z.string().trim().max(2000).optional().or(z.literal("")),
    warehouseId: optionalId(),
    bankAccountId: optionalId(),
    discType: z.enum(["percent", "amount"]).default("percent"),
    discValue: z.coerce.number().min(0, "somethingWentWrong").default(0),
    isVatApplicable: z.boolean().default(false),
    vatPercent: z.coerce.number().min(0).max(100).default(0),
    isRefunded: z.boolean().default(false),
    refundAmount: z.coerce.number().min(0, "somethingWentWrong").default(0),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    lines: z.array(lineItemSchema).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.lines.length === 0) {
      ctx.addIssue({ path: ["lines"], code: z.ZodIssueCode.custom, message: "atLeastOneLineRequired" });
      return;
    }
    const hasInvalidLine = data.lines.some((line) => !line.itemId || !line.unitId || !(line.quantity > 0));
    if (hasInvalidLine) {
      ctx.addIssue({ path: ["lines"], code: z.ZodIssueCode.custom, message: "invalidLineItems" });
    }
    // sales_return moves real stock, so it needs a real warehouse to move it
    // into — price_protection never touches inventory, so warehouse stays
    // optional for it (mirrors why the column itself is nullable).
    if (data.creditNoteType === "sales_return" && !data.warehouseId) {
      ctx.addIssue({ path: ["warehouseId"], code: z.ZodIssueCode.custom, message: "warehouseRequired" });
    }
  });

function canAccessSales(context) {
  return context.accessibleModules.includes("sales");
}

// ---------------------------------------------------------------------------
// Lookup data for the form
// ---------------------------------------------------------------------------

export async function listPartiesForCreditNotes(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({
      id: parties.id,
      name: parties.name,
      type: parties.type,
      partyGroupId: parties.partyGroupId,
      address: parties.address,
      panNumber: parties.panNumber,
    })
    .from(parties)
    .where(ne(parties.type, "Supplier"))
    .orderBy(asc(parties.name));
}

export async function listItemsForCreditNotes(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  const secondaryUnits = alias(units, "secondary_units_cn");

  const rows = await db
    .select({
      id: items.id,
      name: items.name,
      primaryUnitId: items.primaryUnitId,
      primaryUnitCode: units.code,
      secondaryUnitId: items.secondaryUnitId,
      secondaryUnitCode: secondaryUnits.code,
      sellingPrice: items.sellingPrice,
    })
    .from(items)
    .innerJoin(units, eq(items.primaryUnitId, units.id))
    .leftJoin(secondaryUnits, eq(items.secondaryUnitId, secondaryUnits.id))
    .orderBy(asc(items.name));

  if (rows.length === 0) return rows;

  const itemIds = rows.map((row) => row.id);
  const [variantRows, priceRows] = await Promise.all([
    db
      .select({ itemId: itemAttributeValues.itemId, id: attributeValues.id, name: attributeValues.name })
      .from(itemAttributeValues)
      .innerJoin(attributeValues, eq(itemAttributeValues.valueId, attributeValues.id))
      .where(inArray(itemAttributeValues.itemId, itemIds)),
    db
      .select({
        itemId: itemPartyGroupPrices.itemId,
        partyGroupId: itemPartyGroupPrices.partyGroupId,
        sellingPrice: itemPartyGroupPrices.sellingPrice,
      })
      .from(itemPartyGroupPrices)
      .where(inArray(itemPartyGroupPrices.itemId, itemIds)),
  ]);

  const variantsByItem = new Map();
  for (const { itemId, id, name } of variantRows) {
    if (!variantsByItem.has(itemId)) variantsByItem.set(itemId, []);
    variantsByItem.get(itemId).push({ id, name });
  }
  const pricesByItem = new Map();
  for (const { itemId, partyGroupId, sellingPrice } of priceRows) {
    if (!pricesByItem.has(itemId)) pricesByItem.set(itemId, []);
    pricesByItem.get(itemId).push({ partyGroupId, sellingPrice });
  }

  return rows.map((row) => ({
    ...row,
    variants: variantsByItem.get(row.id) ?? [],
    groupPrices: pricesByItem.get(row.id) ?? [],
  }));
}

export async function listWarehousesForCreditNotes(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db.select().from(warehouses).orderBy(desc(warehouses.isPrimary), asc(warehouses.name));
}

export async function listBankAccountsForCreditNotes(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({ id: bankAccounts.id, bankName: bankAccounts.bankName, displayName: bankAccounts.displayName })
    .from(bankAccounts)
    .where(eq(bankAccounts.status, "active"))
    .orderBy(asc(bankAccounts.bankName));
}

export async function getDocumentDefaults(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return { vatEnabled: false, vatPercent: 13 };
  const db = getOrganizationDb(context.session.organizationDbName);
  const [row] = await db
    .select({ defaultVatEnabled: settings.defaultVatEnabled, defaultVatPercent: settings.defaultVatPercent })
    .from(settings)
    .limit(1);
  return {
    vatEnabled: row?.defaultVatEnabled === 1,
    vatPercent: row ? Number(row.defaultVatPercent) : 13,
  };
}

// Single combined lookup for the create/edit form — same shape as
// purchase/debit-notes/actions.js's getDebitNoteFormData (its sales-side
// mirror), just querying items.sellingPrice instead of purchasePrice and
// parties of type Customer/Both instead of Supplier/Both.
export async function getCreditNoteFormData(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const secondaryUnits = alias(units, "secondary_units_cn_form");

  const [partyRows, warehouseRows, itemRows, unitRows, attributeValueRows, bankAccountRows, [settingsRow]] = await Promise.all([
    db
      .select({ id: parties.id, name: parties.name, type: parties.type, address: parties.address, panNumber: parties.panNumber })
      .from(parties)
      .where(ne(parties.type, "Supplier")),
    db.select({ id: warehouses.id, name: warehouses.name }).from(warehouses),
    db
      .select({
        id: items.id,
        name: items.name,
        primaryUnitId: items.primaryUnitId,
        primaryUnitCode: units.code,
        secondaryUnitId: items.secondaryUnitId,
        secondaryUnitCode: secondaryUnits.code,
        sellingPrice: items.sellingPrice,
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

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listCreditNotes(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({
      id: creditNotes.id,
      creditNoteNumber: creditNotes.creditNoteNumber,
      creditNoteDate: creditNotes.creditNoteDate,
      creditNoteType: creditNotes.creditNoteType,
      partyId: creditNotes.partyId,
      partyName: parties.name,
      totalAmount: creditNotes.totalAmount,
      isRefunded: creditNotes.isRefunded,
      refundAmount: creditNotes.refundAmount,
      status: creditNotes.status,
    })
    .from(creditNotes)
    .innerJoin(parties, eq(creditNotes.partyId, parties.id))
    .orderBy(desc(creditNotes.id));
}

export async function getCreditNoteDetail(companySlug, creditNoteId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const id = Number(creditNoteId);
  if (!id) return null;

  const [creditNote] = await db
    .select({
      id: creditNotes.id,
      creditNoteNumber: creditNotes.creditNoteNumber,
      creditNoteDate: creditNotes.creditNoteDate,
      creditNoteType: creditNotes.creditNoteType,
      partyId: creditNotes.partyId,
      partyName: parties.name,
      partyPhone: parties.phoneNumber,
      referenceNo: creditNotes.referenceNo,
      billingName: creditNotes.billingName,
      billingAddress: creditNotes.billingAddress,
      warehouseId: creditNotes.warehouseId,
      warehouseName: warehouses.name,
      bankAccountId: creditNotes.bankAccountId,
      bankName: bankAccounts.bankName,
      bankDisplayName: bankAccounts.displayName,
      subtotal: creditNotes.subtotal,
      discType: creditNotes.discType,
      discPercent: creditNotes.discPercent,
      discAmount: creditNotes.discAmount,
      vatPercent: creditNotes.vatPercent,
      isVatApplicable: creditNotes.isVatApplicable,
      vatAmount: creditNotes.vatAmount,
      totalAmount: creditNotes.totalAmount,
      isRefunded: creditNotes.isRefunded,
      refundAmount: creditNotes.refundAmount,
      notes: creditNotes.notes,
      status: creditNotes.status,
      createdAt: creditNotes.createdAt,
    })
    .from(creditNotes)
    .innerJoin(parties, eq(creditNotes.partyId, parties.id))
    .leftJoin(warehouses, eq(creditNotes.warehouseId, warehouses.id))
    .leftJoin(bankAccounts, eq(creditNotes.bankAccountId, bankAccounts.id))
    .where(eq(creditNotes.id, id))
    .limit(1);
  if (!creditNote) return null;

  const lines = await db
    .select({
      id: creditNoteDetails.id,
      itemId: creditNoteDetails.itemId,
      itemName: items.name,
      variantId: creditNoteDetails.variantId,
      variantName: attributeValues.name,
      unitId: creditNoteDetails.unitId,
      unitCode: units.code,
      quantity: creditNoteDetails.quantity,
      rate: creditNoteDetails.rate,
      discType: creditNoteDetails.discType,
      discPercent: creditNoteDetails.discPercent,
      discAmount: creditNoteDetails.discAmount,
      lineSubtotal: creditNoteDetails.lineSubtotal,
      lineTotal: creditNoteDetails.lineTotal,
    })
    .from(creditNoteDetails)
    .innerJoin(items, eq(creditNoteDetails.itemId, items.id))
    .innerJoin(units, eq(creditNoteDetails.unitId, units.id))
    .leftJoin(attributeValues, eq(creditNoteDetails.variantId, attributeValues.id))
    .where(eq(creditNoteDetails.creditNoteId, id))
    .orderBy(asc(creditNoteDetails.id));

  return { creditNote, lines };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function computeLinesAndTotals(data) {
  const computedLines = data.lines.map((line) => {
    const quantity = Math.round(line.quantity);
    const lineTotals = calcLineTotal({
      quantity,
      rate: line.rate,
      discType: line.discType,
      discValue: line.discValue,
    });
    return { ...line, quantity, ...lineTotals };
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

function detailRowValues(creditNoteId, line) {
  return {
    creditNoteId,
    itemId: line.itemId,
    variantId: line.variantId || null,
    unitId: line.unitId,
    quantity: line.quantity.toFixed(2),
    rate: line.rate.toFixed(5),
    discType: line.discType,
    discPercent: line.discPercent.toFixed(2),
    discAmount: line.discAmount.toFixed(2),
    lineSubtotal: line.lineSubtotal.toFixed(2),
    lineTotal: line.lineTotal.toFixed(2),
  };
}

function headerValues(data, documentTotals, creditNoteNumber, refundAmount) {
  return {
    ...(creditNoteNumber ? { creditNoteNumber } : {}),
    creditNoteDate: data.creditNoteDate,
    creditNoteType: data.creditNoteType,
    partyId: data.partyId,
    referenceNo: data.referenceNo || null,
    billingName: data.billingName || null,
    billingAddress: data.billingAddress || null,
    warehouseId: data.warehouseId || null,
    bankAccountId: data.bankAccountId || null,
    subtotal: documentTotals.subtotal.toFixed(2),
    discType: data.discType,
    discPercent: documentTotals.discPercent.toFixed(2),
    discAmount: documentTotals.discAmount.toFixed(2),
    vatPercent: data.isVatApplicable ? data.vatPercent.toFixed(2) : null,
    isVatApplicable: data.isVatApplicable ? 1 : 0,
    vatAmount: documentTotals.vatAmount.toFixed(2),
    totalAmount: documentTotals.totalAmount.toFixed(2),
    isRefunded: data.isRefunded ? 1 : 0,
    refundAmount: refundAmount.toFixed(2),
    notes: data.notes || null,
  };
}

export async function createCreditNoteAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = creditNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const { computedLines, documentTotals } = computeLinesAndTotals(data);
  if (data.isRefunded && data.refundAmount > documentTotals.totalAmount) {
    return { ok: false, formError: "refundAmountExceedsTotal" };
  }

  const [party] = await db.select({ id: parties.id }).from(parties).where(eq(parties.id, data.partyId)).limit(1);
  if (!party) return { ok: false, fieldErrors: { partyId: ["partyNotFound"] } };

  const refundAmount = data.isRefunded ? round2(data.refundAmount) : 0;

  let creditNoteId = null;
  let creditNoteNumber = null;

  try {
    await db.transaction(async (tx) => {
      creditNoteNumber = await nextWarehouseScopedNumber(tx, {
        table: creditNotes,
        idColumn: creditNotes.id,
        warehousesTable: warehouses,
        warehouseId: data.warehouseId,
        fixedPrefix: FIXED_PREFIX,
      });

      const [{ id }] = await tx
        .insert(creditNotes)
        .values({ ...headerValues(data, documentTotals, creditNoteNumber, refundAmount), status: "completed" })
        .$returningId();
      creditNoteId = id;

      await tx.insert(creditNoteDetails).values(computedLines.map((line) => detailRowValues(id, line)));

      if (data.creditNoteType === "sales_return") {
        for (const line of computedLines) {
          await applyInventoryChange(tx, {
            itemId: line.itemId,
            variantId: line.variantId || 0,
            warehouseId: data.warehouseId,
            unitId: line.unitId,
            delta: line.quantity,
            changeType: "sales_return",
            note: `Credit note ${creditNoteNumber}`,
          });
        }
      }

      if (data.isRefunded && data.bankAccountId && refundAmount > 0) {
        await tx.insert(bankTransactions).values({
          bankAccountId: data.bankAccountId,
          txnDate: data.creditNoteDate,
          txnType: "debit",
          transactionType: "credit_note",
          transactionRefId: id,
          amount: refundAmount.toFixed(2),
          referenceNo: creditNoteNumber,
          note: "Credit note refund",
        });
      }

      await recalculatePartyBalance(tx, data.partyId);
    });
  } catch (error) {
    console.error("[sales/credit-notes] createCreditNoteAction failed", error);
    return { ok: false, formError: "somethingWentWrong" };
  }

  revalidatePath(`/${companySlug}/sales/credit-notes`);
  revalidatePath(`/${companySlug}/parties`);
  return { ok: true, message: "creditNoteCreated", id: creditNoteId };
}

export async function updateCreditNoteAction(companySlug, creditNoteId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = creditNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  const id = Number(creditNoteId);
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db.select().from(creditNotes).where(eq(creditNotes.id, id)).limit(1);
  if (!existing) return { ok: false, fieldErrors: {}, formError: "creditNoteNotFound" };
  if (existing.status === "cancelled") return { ok: false, formError: "creditNoteCancelled" };

  const oldLines = await db.select().from(creditNoteDetails).where(eq(creditNoteDetails.creditNoteId, id));

  const { computedLines, documentTotals } = computeLinesAndTotals(data);
  if (data.isRefunded && data.refundAmount > documentTotals.totalAmount) {
    return { ok: false, formError: "refundAmountExceedsTotal" };
  }

  const [party] = await db.select({ id: parties.id }).from(parties).where(eq(parties.id, data.partyId)).limit(1);
  if (!party) return { ok: false, fieldErrors: { partyId: ["partyNotFound"] } };

  const refundAmount = data.isRefunded ? round2(data.refundAmount) : 0;
  const oldPartyId = existing.partyId;

  try {
    await db.transaction(async (tx) => {
      if (existing.creditNoteType === "sales_return" && existing.warehouseId) {
        for (const line of oldLines) {
          await applyInventoryChange(tx, {
            itemId: line.itemId,
            variantId: line.variantId || 0,
            warehouseId: existing.warehouseId,
            unitId: line.unitId,
            delta: -Number(line.quantity),
            changeType: "sales_return",
            note: `Credit note ${existing.creditNoteNumber} (edit reversal)`,
          });
        }
      }

      await tx
        .delete(bankTransactions)
        .where(and(eq(bankTransactions.transactionType, "credit_note"), eq(bankTransactions.transactionRefId, id)));

      await tx.delete(creditNoteDetails).where(eq(creditNoteDetails.creditNoteId, id));
      await tx.insert(creditNoteDetails).values(computedLines.map((line) => detailRowValues(id, line)));

      if (data.creditNoteType === "sales_return") {
        for (const line of computedLines) {
          await applyInventoryChange(tx, {
            itemId: line.itemId,
            variantId: line.variantId || 0,
            warehouseId: data.warehouseId,
            unitId: line.unitId,
            delta: line.quantity,
            changeType: "sales_return",
            note: `Credit note ${existing.creditNoteNumber}`,
          });
        }
      }

      await tx
        .update(creditNotes)
        .set(headerValues(data, documentTotals, null, refundAmount))
        .where(eq(creditNotes.id, id));

      if (data.isRefunded && data.bankAccountId && refundAmount > 0) {
        await tx.insert(bankTransactions).values({
          bankAccountId: data.bankAccountId,
          txnDate: data.creditNoteDate,
          txnType: "debit",
          transactionType: "credit_note",
          transactionRefId: id,
          amount: refundAmount.toFixed(2),
          referenceNo: existing.creditNoteNumber,
          note: "Credit note refund",
        });
      }

      await recalculatePartyBalance(tx, oldPartyId);
      if (data.partyId !== oldPartyId) {
        await recalculatePartyBalance(tx, data.partyId);
      }
    });
  } catch (error) {
    console.error("[sales/credit-notes] updateCreditNoteAction failed", error);
    return { ok: false, formError: "somethingWentWrong" };
  }

  revalidatePath(`/${companySlug}/sales/credit-notes`);
  revalidatePath(`/${companySlug}/sales/credit-notes/${id}`);
  revalidatePath(`/${companySlug}/parties`);
  return { ok: true, message: "creditNoteUpdated" };
}

export async function cancelCreditNoteAction(companySlug, creditNoteId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const id = Number(creditNoteId);
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db.select().from(creditNotes).where(eq(creditNotes.id, id)).limit(1);
  if (!existing) return { ok: false, formError: "creditNoteNotFound" };
  if (existing.status === "cancelled") return { ok: false, formError: "creditNoteAlreadyCancelled" };

  const lines = await db.select().from(creditNoteDetails).where(eq(creditNoteDetails.creditNoteId, id));

  await db.transaction(async (tx) => {
    if (existing.creditNoteType === "sales_return" && existing.warehouseId) {
      for (const line of lines) {
        await applyInventoryChange(tx, {
          itemId: line.itemId,
          variantId: line.variantId || 0,
          warehouseId: existing.warehouseId,
          unitId: line.unitId,
          delta: -Number(line.quantity),
          changeType: "sales_return",
          note: `Credit note ${existing.creditNoteNumber} (cancelled)`,
        });
      }
    }

    await tx
      .delete(bankTransactions)
      .where(and(eq(bankTransactions.transactionType, "credit_note"), eq(bankTransactions.transactionRefId, id)));

    await tx.update(creditNotes).set({ status: "cancelled" }).where(eq(creditNotes.id, id));

    await recalculatePartyBalance(tx, existing.partyId);
  });

  revalidatePath(`/${companySlug}/sales/credit-notes`);
  revalidatePath(`/${companySlug}/sales/credit-notes/${id}`);
  revalidatePath(`/${companySlug}/parties`);
  return { ok: true, message: "creditNoteCancelled" };
}
