"use server";

import { alias } from "drizzle-orm/mysql-core";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  attributeValues,
  bankAccounts,
  bankTransactions,
  deliveryChallanItems,
  deliveryChallans,
  itemAttributeValues,
  itemPartyGroupPrices,
  items,
  parties,
  salesInvoiceDetails,
  salesInvoices,
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
 * Ported from legacy models/SalesInvoice.php (verified in full — see
 * ../../../../../AGENTS.md §6 and this task's brief for the exact rules).
 * The most carefully-researched document in the port: line items + header
 * discount + VAT + optional same-time receipt + inventory + party ledger +
 * delivery-challan-reversal-on-cancel, all in one save. Every other
 * Sales/Purchase money document mirrors this shape.
 *
 * Not wrapped in one shared "document" helper — each module's actions.js
 * owns its own read/write functions per ../../../../../AGENTS.md §7's
 * "keep the main thread focused on synthesis" spirit applied to file
 * ownership: sales/credit-notes/actions.js intentionally duplicates the
 * small lookup queries below (listPartiesForInvoices-shaped helpers) rather
 * than importing across module folders, so two agents working the two
 * folders in parallel never collide on a shared file.
 */

const FIXED_PREFIX = "INV";

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

const salesInvoiceSchema = z
  .object({
    invoiceDate: z.string().trim().min(1, "invoiceDateRequired"),
    partyId: z.coerce.number().int().positive("partyRequired"),
    billingName: z.string().trim().max(225).optional().or(z.literal("")),
    billingAddress: z.string().trim().max(2000).optional().or(z.literal("")),
    panNumber: z.string().trim().max(50).optional().or(z.literal("")),
    warehouseId: z.coerce.number().int().positive("warehouseRequired"),
    bankAccountId: optionalId(),
    discType: z.enum(["percent", "amount"]).default("percent"),
    discValue: z.coerce.number().min(0, "somethingWentWrong").default(0),
    isVatApplicable: z.boolean().default(false),
    vatPercent: z.coerce.number().min(0).max(100).default(0),
    isReceived: z.boolean().default(true),
    receivedAmount: z.coerce.number().min(0, "somethingWentWrong").default(0),
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
  });

function canAccessSales(context) {
  return context.accessibleModules.includes("sales");
}

// ---------------------------------------------------------------------------
// Lookup data for the form (party/item/warehouse/bank-account pickers + org
// VAT defaults) — read-only, no auth-bearing writes.
// ---------------------------------------------------------------------------

// Customers/Both only — a sales invoice is never raised against a pure
// Supplier, though the party master itself doesn't enforce that (a
// convenience filter, not a data-integrity rule; not ported from legacy,
// which has no per-document party-type restriction in the schema).
export async function listPartiesForInvoices(companySlug) {
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

// Items with unit codes (primary + optional secondary), assigned attribute
// values (for the optional per-line variant picker), and any per-party-group
// selling-price overrides (item_party_group_prices) so the line-item editor
// can default a line's rate to the correct price for the selected party.
export async function listItemsForInvoices(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  const secondaryUnits = alias(units, "secondary_units_inv");

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

export async function listWarehousesForInvoices(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db.select().from(warehouses).orderBy(desc(warehouses.isPrimary), asc(warehouses.name));
}

export async function listBankAccountsForInvoices(companySlug) {
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

// Single combined lookup for the redesigned create/edit form (see
// invoice-form.jsx) — composes the existing individual list*/getDocumentDefaults
// lookups above rather than re-querying, matching the shape
// purchase/bills/actions.js's getPurchaseBillFormData already uses.
export async function getSalesInvoiceFormData(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  const db = canAccessSales(context) ? getOrganizationDb(context.session.organizationDbName) : null;
  const [partyRows, itemRows, warehouseRows, bankAccountRows, defaults, unitRows] = await Promise.all([
    listPartiesForInvoices(companySlug),
    listItemsForInvoices(companySlug),
    listWarehousesForInvoices(companySlug),
    listBankAccountsForInvoices(companySlug),
    getDocumentDefaults(companySlug),
    db ? db.select({ id: units.id, name: units.name, code: units.code }).from(units) : [],
  ]);
  return {
    parties: partyRows,
    items: itemRows,
    warehouses: warehouseRows,
    bankAccounts: bankAccountRows,
    units: unitRows,
    defaultVatEnabled: defaults.vatEnabled,
    defaultVatPercent: defaults.vatPercent,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listSalesInvoices(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  const rows = await db
    .select({
      id: salesInvoices.id,
      invoiceNumber: salesInvoices.invoiceNumber,
      invoiceDate: salesInvoices.invoiceDate,
      partyId: salesInvoices.partyId,
      partyName: parties.name,
      totalAmount: salesInvoices.totalAmount,
      dueAmount: salesInvoices.dueAmount,
      isReceived: salesInvoices.isReceived,
      status: salesInvoices.status,
    })
    .from(salesInvoices)
    .innerJoin(parties, eq(salesInvoices.partyId, parties.id))
    .orderBy(desc(salesInvoices.id));
  return rows;
}

export async function getSalesInvoiceDetail(companySlug, invoiceId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const id = Number(invoiceId);
  if (!id) return null;

  const [invoice] = await db
    .select({
      id: salesInvoices.id,
      invoiceNumber: salesInvoices.invoiceNumber,
      invoiceDate: salesInvoices.invoiceDate,
      partyId: salesInvoices.partyId,
      partyName: parties.name,
      partyPhone: parties.phoneNumber,
      billingName: salesInvoices.billingName,
      billingAddress: salesInvoices.billingAddress,
      panNumber: salesInvoices.panNumber,
      bankAccountId: salesInvoices.bankAccountId,
      bankName: bankAccounts.bankName,
      bankDisplayName: bankAccounts.displayName,
      warehouseId: salesInvoices.warehouseId,
      warehouseName: warehouses.name,
      subtotal: salesInvoices.subtotal,
      discType: salesInvoices.discType,
      discPercent: salesInvoices.discPercent,
      discAmount: salesInvoices.discAmount,
      vatPercent: salesInvoices.vatPercent,
      isVatApplicable: salesInvoices.isVatApplicable,
      vatAmount: salesInvoices.vatAmount,
      totalAmount: salesInvoices.totalAmount,
      isReceived: salesInvoices.isReceived,
      receivedAmount: salesInvoices.receivedAmount,
      dueAmount: salesInvoices.dueAmount,
      notes: salesInvoices.notes,
      status: salesInvoices.status,
      createdAt: salesInvoices.createdAt,
    })
    .from(salesInvoices)
    .innerJoin(parties, eq(salesInvoices.partyId, parties.id))
    .leftJoin(bankAccounts, eq(salesInvoices.bankAccountId, bankAccounts.id))
    .leftJoin(warehouses, eq(salesInvoices.warehouseId, warehouses.id))
    .where(eq(salesInvoices.id, id))
    .limit(1);
  if (!invoice) return null;

  const lines = await db
    .select({
      id: salesInvoiceDetails.id,
      itemId: salesInvoiceDetails.itemId,
      itemName: items.name,
      variantId: salesInvoiceDetails.variantId,
      variantName: attributeValues.name,
      unitId: salesInvoiceDetails.unitId,
      unitCode: units.code,
      quantity: salesInvoiceDetails.quantity,
      rate: salesInvoiceDetails.rate,
      discType: salesInvoiceDetails.discType,
      discPercent: salesInvoiceDetails.discPercent,
      discAmount: salesInvoiceDetails.discAmount,
      lineSubtotal: salesInvoiceDetails.lineSubtotal,
      lineTotal: salesInvoiceDetails.lineTotal,
    })
    .from(salesInvoiceDetails)
    .innerJoin(items, eq(salesInvoiceDetails.itemId, items.id))
    .innerJoin(units, eq(salesInvoiceDetails.unitId, units.id))
    .leftJoin(attributeValues, eq(salesInvoiceDetails.variantId, attributeValues.id))
    .where(eq(salesInvoiceDetails.invoiceId, id))
    .orderBy(asc(salesInvoiceDetails.id));

  return { invoice, lines };
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

function detailRowValues(invoiceId, line) {
  return {
    invoiceId,
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

function headerValues(data, documentTotals, invoiceNumber, receivedAmount, dueAmount) {
  return {
    ...(invoiceNumber ? { invoiceNumber } : {}),
    invoiceDate: data.invoiceDate,
    partyId: data.partyId,
    billingName: data.billingName || null,
    billingAddress: data.billingAddress || null,
    panNumber: data.panNumber || null,
    bankAccountId: data.bankAccountId || null,
    warehouseId: data.warehouseId,
    subtotal: documentTotals.subtotal.toFixed(2),
    discType: data.discType,
    discPercent: documentTotals.discPercent.toFixed(2),
    discAmount: documentTotals.discAmount.toFixed(2),
    vatPercent: data.isVatApplicable ? data.vatPercent.toFixed(2) : null,
    isVatApplicable: data.isVatApplicable ? 1 : 0,
    vatAmount: documentTotals.vatAmount.toFixed(2),
    totalAmount: documentTotals.totalAmount.toFixed(2),
    isReceived: data.isReceived ? 1 : 0,
    receivedAmount: receivedAmount.toFixed(2),
    dueAmount: dueAmount.toFixed(2),
    notes: data.notes || null,
  };
}

export async function createSalesInvoiceAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = salesInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const { computedLines, documentTotals } = computeLinesAndTotals(data);
  if (data.isReceived && data.receivedAmount > documentTotals.totalAmount) {
    return { ok: false, formError: "receivedAmountExceedsTotal" };
  }

  const [party] = await db.select({ id: parties.id }).from(parties).where(eq(parties.id, data.partyId)).limit(1);
  if (!party) return { ok: false, fieldErrors: { partyId: ["partyNotFound"] } };

  const receivedAmount = data.isReceived ? round2(data.receivedAmount) : 0;
  const dueAmount = round2(documentTotals.totalAmount - receivedAmount);

  let stockWarning = false;
  let invoiceId = null;
  let invoiceNumber = null;

  try {
    await db.transaction(async (tx) => {
      invoiceNumber = await nextWarehouseScopedNumber(tx, {
        table: salesInvoices,
        idColumn: salesInvoices.id,
        warehousesTable: warehouses,
        warehouseId: data.warehouseId,
        fixedPrefix: FIXED_PREFIX,
      });

      const [{ id }] = await tx
        .insert(salesInvoices)
        .values({ ...headerValues(data, documentTotals, invoiceNumber, receivedAmount, dueAmount), status: "completed" })
        .$returningId();
      invoiceId = id;

      await tx.insert(salesInvoiceDetails).values(computedLines.map((line) => detailRowValues(id, line)));

      for (const line of computedLines) {
        const result = await applyInventoryChange(tx, {
          itemId: line.itemId,
          variantId: line.variantId || 0,
          warehouseId: data.warehouseId,
          unitId: line.unitId,
          delta: -line.quantity,
          changeType: "sale",
          note: `Sales invoice ${invoiceNumber}`,
        });
        if (!result.ok) {
          const error = new Error("INSUFFICIENT_STOCK");
          error.insufficientStock = true;
          throw error;
        }
        if (result.warning) stockWarning = true;
      }

      if (data.isReceived && data.bankAccountId && receivedAmount > 0) {
        await tx.insert(bankTransactions).values({
          bankAccountId: data.bankAccountId,
          txnDate: data.invoiceDate,
          txnType: "credit",
          transactionType: "sales",
          transactionRefId: id,
          amount: receivedAmount.toFixed(2),
          referenceNo: invoiceNumber,
          note: "Sales invoice receipt",
        });
      }

      await recalculatePartyBalance(tx, data.partyId);
    });
  } catch (error) {
    if (error?.insufficientStock) {
      return { ok: false, formError: "insufficientStock" };
    }
    console.error("[sales/invoices] createSalesInvoiceAction failed", error);
    return { ok: false, formError: "somethingWentWrong" };
  }

  revalidatePath(`/${companySlug}/sales/invoices`);
  revalidatePath(`/${companySlug}/parties`);
  return { ok: true, message: "salesInvoiceCreated", id: invoiceId, warning: stockWarning ? "stockWentNegative" : null };
}

export async function updateSalesInvoiceAction(companySlug, invoiceId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = salesInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  const id = Number(invoiceId);
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, id)).limit(1);
  if (!existing) return { ok: false, fieldErrors: {}, formError: "salesInvoiceNotFound" };
  if (existing.status === "cancelled") return { ok: false, formError: "salesInvoiceCancelled" };

  const oldLines = await db.select().from(salesInvoiceDetails).where(eq(salesInvoiceDetails.invoiceId, id));

  const { computedLines, documentTotals } = computeLinesAndTotals(data);
  if (data.isReceived && data.receivedAmount > documentTotals.totalAmount) {
    return { ok: false, formError: "receivedAmountExceedsTotal" };
  }

  const [party] = await db.select({ id: parties.id }).from(parties).where(eq(parties.id, data.partyId)).limit(1);
  if (!party) return { ok: false, fieldErrors: { partyId: ["partyNotFound"] } };

  const receivedAmount = data.isReceived ? round2(data.receivedAmount) : 0;
  const dueAmount = round2(documentTotals.totalAmount - receivedAmount);
  const oldPartyId = existing.partyId;

  let stockWarning = false;

  try {
    await db.transaction(async (tx) => {
      // Reverse every old line's deduction first, using the OLD warehouse —
      // restores stock exactly as it was before this invoice ever existed.
      for (const line of oldLines) {
        await applyInventoryChange(tx, {
          itemId: line.itemId,
          variantId: line.variantId || 0,
          warehouseId: existing.warehouseId,
          unitId: line.unitId,
          delta: Number(line.quantity),
          changeType: "sale",
          note: `Sales invoice ${existing.invoiceNumber} (edit reversal)`,
        });
      }

      await tx
        .delete(bankTransactions)
        .where(and(eq(bankTransactions.transactionType, "sales"), eq(bankTransactions.transactionRefId, id)));

      await tx.delete(salesInvoiceDetails).where(eq(salesInvoiceDetails.invoiceId, id));
      await tx.insert(salesInvoiceDetails).values(computedLines.map((line) => detailRowValues(id, line)));

      for (const line of computedLines) {
        const result = await applyInventoryChange(tx, {
          itemId: line.itemId,
          variantId: line.variantId || 0,
          warehouseId: data.warehouseId,
          unitId: line.unitId,
          delta: -line.quantity,
          changeType: "sale",
          note: `Sales invoice ${existing.invoiceNumber}`,
        });
        if (!result.ok) {
          const error = new Error("INSUFFICIENT_STOCK");
          error.insufficientStock = true;
          throw error;
        }
        if (result.warning) stockWarning = true;
      }

      await tx
        .update(salesInvoices)
        .set(headerValues(data, documentTotals, null, receivedAmount, dueAmount))
        .where(eq(salesInvoices.id, id));

      if (data.isReceived && data.bankAccountId && receivedAmount > 0) {
        await tx.insert(bankTransactions).values({
          bankAccountId: data.bankAccountId,
          txnDate: data.invoiceDate,
          txnType: "credit",
          transactionType: "sales",
          transactionRefId: id,
          amount: receivedAmount.toFixed(2),
          referenceNo: existing.invoiceNumber,
          note: "Sales invoice receipt",
        });
      }

      await recalculatePartyBalance(tx, oldPartyId);
      if (data.partyId !== oldPartyId) {
        await recalculatePartyBalance(tx, data.partyId);
      }
    });
  } catch (error) {
    if (error?.insufficientStock) {
      return { ok: false, formError: "insufficientStock" };
    }
    console.error("[sales/invoices] updateSalesInvoiceAction failed", error);
    return { ok: false, formError: "somethingWentWrong" };
  }

  revalidatePath(`/${companySlug}/sales/invoices`);
  revalidatePath(`/${companySlug}/sales/invoices/${id}`);
  revalidatePath(`/${companySlug}/parties`);
  return { ok: true, message: "salesInvoiceUpdated", warning: stockWarning ? "stockWentNegative" : null };
}

export async function cancelSalesInvoiceAction(companySlug, invoiceId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const id = Number(invoiceId);
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, id)).limit(1);
  if (!existing) return { ok: false, formError: "salesInvoiceNotFound" };
  if (existing.status === "cancelled") return { ok: false, formError: "salesInvoiceAlreadyCancelled" };

  const lines = await db.select().from(salesInvoiceDetails).where(eq(salesInvoiceDetails.invoiceId, id));

  await db.transaction(async (tx) => {
    for (const line of lines) {
      await applyInventoryChange(tx, {
        itemId: line.itemId,
        variantId: line.variantId || 0,
        warehouseId: existing.warehouseId,
        unitId: line.unitId,
        delta: Number(line.quantity),
        changeType: "sale",
        note: `Sales invoice ${existing.invoiceNumber} (cancelled)`,
      });
    }

    await tx
      .delete(bankTransactions)
      .where(and(eq(bankTransactions.transactionType, "sales"), eq(bankTransactions.transactionRefId, id)));

    // Reverse any delivery challan created FROM this invoice — the module
    // that authors those challans may not exist yet, in which case this is
    // just zero rows (see this file's header comment / task brief).
    const relatedChallans = await tx
      .select()
      .from(deliveryChallans)
      .where(
        and(eq(deliveryChallans.sourceType, "sale"), eq(deliveryChallans.sourceId, id), ne(deliveryChallans.status, "cancelled"))
      );

    for (const challan of relatedChallans) {
      if (challan.stockDeducted === 1 && challan.warehouseId) {
        const challanLines = await tx
          .select()
          .from(deliveryChallanItems)
          .where(eq(deliveryChallanItems.challanId, challan.id));
        for (const item of challanLines) {
          if (!item.unitId) continue; // no FK on this table — a row with no unit can't be restored
          await applyInventoryChange(tx, {
            itemId: item.itemId,
            variantId: item.variantId || 0,
            warehouseId: challan.warehouseId,
            unitId: item.unitId,
            delta: Number(item.quantity),
            changeType: "challan_in",
            note: `Delivery challan ${challan.challanNumber} (reversed with invoice ${existing.invoiceNumber})`,
          });
        }
      }
      await tx.update(deliveryChallans).set({ status: "cancelled", stockDeducted: 0 }).where(eq(deliveryChallans.id, challan.id));
    }

    await tx
      .update(salesInvoices)
      .set({ status: "cancelled", isReceived: 0, receivedAmount: "0.00", dueAmount: "0.00" })
      .where(eq(salesInvoices.id, id));

    await recalculatePartyBalance(tx, existing.partyId);
  });

  revalidatePath(`/${companySlug}/sales/invoices`);
  revalidatePath(`/${companySlug}/sales/invoices/${id}`);
  revalidatePath(`/${companySlug}/sales/delivery-challans`);
  revalidatePath(`/${companySlug}/parties`);
  return { ok: true, message: "salesInvoiceCancelled" };
}
