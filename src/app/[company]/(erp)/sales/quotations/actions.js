"use server";

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  attributeValues,
  attributes,
  items,
  parties,
  salesQuotationDetails,
  salesQuotations,
  settings,
  units,
  warehouses,
} from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { calcDocumentTotals, calcLineTotal } from "@/lib/money";
import { nextFixedPrefixNumber } from "@/lib/document-numbering";

/**
 * Ported from legacy models/SalesQuotation.php (APP-REPORT.md §7.1) — same
 * workflow-only shape as Sales Orders (see ../orders/actions.js), plus a
 * `validUntil` date. NO inventory or party-ledger effect at any status
 * (draft/sent/accepted/converted/expired/cancelled). No DB relationship to
 * Sales Orders or Sales Invoices — the "Create Order" / "Create Invoice"
 * buttons on the detail view are pure UI convenience, pre-filling the target
 * form via the same query-string convention as ../orders/actions.js's
 * "Create Invoice from this Order" (partyId, warehouseId, billingName,
 * billingAddress, panNumber, notes, fromQuotationId, lines). `quotationNumber`
 * auto-suggests (nextFixedPrefixNumber) but stays free-text with an
 * application-level uniqueness check, same numbering note as orders.
 */

function canAccessSales(context) {
  return context.accessibleModules.includes("sales");
}

const lineSchema = z.object({
  itemId: z.coerce.number().int().positive("itemRequired"),
  variantId: z.coerce.number().int().positive().nullable().optional(),
  unitId: z.coerce.number().int().positive("unitRequired"),
  quantity: z.coerce.number().positive("quantityRequired"),
  rate: z.coerce.number().min(0, "somethingWentWrong").default(0),
  discType: z.enum(["percent", "amount"]).default("percent"),
  discValue: z.coerce.number().min(0, "somethingWentWrong").default(0),
});

const quotationSchema = z.object({
  quotationNumber: z.string().trim().min(1, "quotationNumberRequired").max(50, "quotationNumberTooLong"),
  quotationDate: z.string().trim().min(1, "quotationDateRequired"),
  validUntil: z.string().trim().optional().or(z.literal("")),
  partyId: z.coerce.number().int().positive("partyRequired"),
  billingName: z.string().trim().max(225).optional().or(z.literal("")),
  billingAddress: z.string().trim().max(2000).optional().or(z.literal("")),
  panNumber: z.string().trim().max(50).optional().or(z.literal("")),
  warehouseId: z.coerce.number().int().positive().nullable().optional(),
  discType: z.enum(["percent", "amount"]).default("percent"),
  discValue: z.coerce.number().min(0, "somethingWentWrong").default(0),
  isVatApplicable: z.boolean().default(false),
  vatPercent: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  status: z.enum(["draft", "sent", "accepted", "converted", "expired", "cancelled"]).default("sent"),
  lines: z.array(lineSchema).min(1, "atLeastOneLineRequired"),
});

async function quotationNumberExists(db, quotationNumber, exceptId) {
  const where = exceptId
    ? and(eq(salesQuotations.quotationNumber, quotationNumber), ne(salesQuotations.id, exceptId))
    : eq(salesQuotations.quotationNumber, quotationNumber);
  const existing = await db.select({ id: salesQuotations.id }).from(salesQuotations).where(where).limit(1);
  return existing.length > 0;
}

// Same recompute-from-scratch discipline as sales orders — see
// ../orders/actions.js's computeOrderTotals for the full rationale.
function computeQuotationTotals(data) {
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

function quotationHeaderValues(data, documentTotals) {
  return {
    quotationNumber: data.quotationNumber,
    quotationDate: data.quotationDate,
    validUntil: data.validUntil || null,
    partyId: data.partyId,
    billingName: data.billingName || null,
    billingAddress: data.billingAddress || null,
    panNumber: data.panNumber || null,
    warehouseId: data.warehouseId || null,
    subtotal: documentTotals.subtotal.toFixed(2),
    discType: data.discType,
    discPercent: documentTotals.discPercent.toFixed(2),
    discAmount: documentTotals.discAmount.toFixed(2),
    vatPercent: data.isVatApplicable ? data.vatPercent.toFixed(2) : null,
    isVatApplicable: data.isVatApplicable ? 1 : 0,
    vatAmount: documentTotals.vatAmount.toFixed(2),
    totalAmount: documentTotals.totalAmount.toFixed(2),
    notes: data.notes || null,
    status: data.status,
  };
}

async function insertQuotationLines(db, quotationId, computedLines) {
  await db.insert(salesQuotationDetails).values(
    computedLines.map((line) => ({
      quotationId,
      itemId: line.itemId,
      variantId: line.variantId || null,
      unitId: line.unitId,
      quantity: line.quantity,
      rate: Number(line.rate).toFixed(5),
      discType: line.discType,
      discPercent: line.discPercent.toFixed(2),
      discAmount: line.discAmount.toFixed(2),
      lineSubtotal: line.lineSubtotal.toFixed(2),
      lineTotal: line.lineTotal.toFixed(2),
    }))
  );
}

export async function listSalesQuotations(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({
      id: salesQuotations.id,
      quotationNumber: salesQuotations.quotationNumber,
      quotationDate: salesQuotations.quotationDate,
      validUntil: salesQuotations.validUntil,
      partyId: salesQuotations.partyId,
      partyName: parties.name,
      warehouseId: salesQuotations.warehouseId,
      warehouseName: warehouses.name,
      totalAmount: salesQuotations.totalAmount,
      status: salesQuotations.status,
      createdAt: salesQuotations.createdAt,
    })
    .from(salesQuotations)
    .innerJoin(parties, eq(salesQuotations.partyId, parties.id))
    .leftJoin(warehouses, eq(salesQuotations.warehouseId, warehouses.id))
    .orderBy(desc(salesQuotations.id));
}

export async function getSalesQuotationDetail(companySlug, quotationId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const id = Number(quotationId);

  const [quotation] = await db
    .select({
      id: salesQuotations.id,
      quotationNumber: salesQuotations.quotationNumber,
      quotationDate: salesQuotations.quotationDate,
      validUntil: salesQuotations.validUntil,
      partyId: salesQuotations.partyId,
      partyName: parties.name,
      billingName: salesQuotations.billingName,
      billingAddress: salesQuotations.billingAddress,
      panNumber: salesQuotations.panNumber,
      warehouseId: salesQuotations.warehouseId,
      warehouseName: warehouses.name,
      subtotal: salesQuotations.subtotal,
      discType: salesQuotations.discType,
      discPercent: salesQuotations.discPercent,
      discAmount: salesQuotations.discAmount,
      vatPercent: salesQuotations.vatPercent,
      isVatApplicable: salesQuotations.isVatApplicable,
      vatAmount: salesQuotations.vatAmount,
      totalAmount: salesQuotations.totalAmount,
      notes: salesQuotations.notes,
      status: salesQuotations.status,
      createdAt: salesQuotations.createdAt,
    })
    .from(salesQuotations)
    .innerJoin(parties, eq(salesQuotations.partyId, parties.id))
    .leftJoin(warehouses, eq(salesQuotations.warehouseId, warehouses.id))
    .where(eq(salesQuotations.id, id))
    .limit(1);
  if (!quotation) return null;

  const lines = await db
    .select({
      id: salesQuotationDetails.id,
      itemId: salesQuotationDetails.itemId,
      itemName: items.name,
      variantId: salesQuotationDetails.variantId,
      variantName: attributeValues.name,
      unitId: salesQuotationDetails.unitId,
      unitCode: units.code,
      quantity: salesQuotationDetails.quantity,
      rate: salesQuotationDetails.rate,
      discType: salesQuotationDetails.discType,
      discPercent: salesQuotationDetails.discPercent,
      discAmount: salesQuotationDetails.discAmount,
      lineSubtotal: salesQuotationDetails.lineSubtotal,
      lineTotal: salesQuotationDetails.lineTotal,
    })
    .from(salesQuotationDetails)
    .innerJoin(items, eq(salesQuotationDetails.itemId, items.id))
    .innerJoin(units, eq(salesQuotationDetails.unitId, units.id))
    .leftJoin(attributeValues, eq(salesQuotationDetails.variantId, attributeValues.id))
    .where(eq(salesQuotationDetails.quotationId, id));

  return { quotation, lines };
}

// Same picker/default-VAT shape as getSalesOrderFormData (../orders/actions.js)
export async function getSalesQuotationFormData(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const secondaryUnits = alias(units, "secondary_units");

  const [partyRows, warehouseRows, itemRows, unitRows, attributeValueRows, [settingsRow], suggestedQuotationNumber] =
    await Promise.all([
      db
        .select({ id: parties.id, name: parties.name, type: parties.type, address: parties.address, panNumber: parties.panNumber })
        .from(parties)
        .where(inArray(parties.type, ["Customer", "Both"])),
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
      db.select({ defaultVatEnabled: settings.defaultVatEnabled, defaultVatPercent: settings.defaultVatPercent }).from(settings).limit(1),
      nextFixedPrefixNumber(db, { table: salesQuotations, idColumn: salesQuotations.id, prefix: "SQ" }),
    ]);

  return {
    parties: partyRows,
    warehouses: warehouseRows,
    items: itemRows,
    units: unitRows,
    attributeValues: attributeValueRows,
    defaultVatEnabled: settingsRow?.defaultVatEnabled === 1,
    defaultVatPercent: Number(settingsRow?.defaultVatPercent ?? 13),
    suggestedQuotationNumber,
  };
}

export async function createSalesQuotationAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = quotationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  if (await quotationNumberExists(db, data.quotationNumber)) {
    return { ok: false, fieldErrors: { quotationNumber: ["quotationNumberExists"] } };
  }

  const { computedLines, documentTotals } = computeQuotationTotals(data);

  const [{ id: quotationId }] = await db
    .insert(salesQuotations)
    .values(quotationHeaderValues(data, documentTotals))
    .$returningId();
  await insertQuotationLines(db, quotationId, computedLines);

  revalidatePath(`/${companySlug}/sales/quotations`);
  return { ok: true, message: "salesQuotationCreated", id: quotationId };
}

export async function updateSalesQuotationAction(companySlug, quotationId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = quotationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(quotationId);
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db.select({ id: salesQuotations.id }).from(salesQuotations).where(eq(salesQuotations.id, id)).limit(1);
  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "salesQuotationNotFound" };
  }
  if (await quotationNumberExists(db, data.quotationNumber, id)) {
    return { ok: false, fieldErrors: { quotationNumber: ["quotationNumberExists"] } };
  }

  const { computedLines, documentTotals } = computeQuotationTotals(data);

  await db.update(salesQuotations).set(quotationHeaderValues(data, documentTotals)).where(eq(salesQuotations.id, id));
  await db.delete(salesQuotationDetails).where(eq(salesQuotationDetails.quotationId, id));
  await insertQuotationLines(db, id, computedLines);

  revalidatePath(`/${companySlug}/sales/quotations`);
  revalidatePath(`/${companySlug}/sales/quotations/${id}`);
  return { ok: true, message: "salesQuotationUpdated" };
}

// Pure status transition (draft/sent/accepted/converted/expired/cancelled) —
// a quotation never touches inventory or the party ledger at any status.
export async function updateSalesQuotationStatusAction(companySlug, quotationId, status) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, formError: "notAllowed" };
  }
  if (!["draft", "sent", "accepted", "converted", "expired", "cancelled"].includes(status)) {
    return { ok: false, formError: "somethingWentWrong" };
  }

  const id = Number(quotationId);
  const db = getOrganizationDb(context.session.organizationDbName);
  const [existing] = await db.select({ id: salesQuotations.id }).from(salesQuotations).where(eq(salesQuotations.id, id)).limit(1);
  if (!existing) {
    return { ok: false, formError: "salesQuotationNotFound" };
  }

  await db.update(salesQuotations).set({ status }).where(eq(salesQuotations.id, id));

  revalidatePath(`/${companySlug}/sales/quotations`);
  revalidatePath(`/${companySlug}/sales/quotations/${id}`);
  return { ok: true, message: "salesQuotationStatusUpdated" };
}

export async function deleteSalesQuotationsAction(companySlug, quotationIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const ids = (Array.isArray(quotationIds) ? quotationIds : [quotationIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) {
    return { ok: false, formError: "salesQuotationNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  // Safe hard delete — quotations never touch inventory or the party ledger
  // and nothing else references sales_quotations, same as sales_orders.
  await db.delete(salesQuotations).where(inArray(salesQuotations.id, ids));

  revalidatePath(`/${companySlug}/sales/quotations`);
  return { ok: true, message: "salesQuotationsDeleted", count: ids.length };
}
