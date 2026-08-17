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
  purchaseOrderDetails,
  purchaseOrders,
  settings,
  units,
  warehouses,
} from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { calcDocumentTotals, calcLineTotal } from "@/lib/money";
import { nextFixedPrefixNumber } from "@/lib/document-numbering";

/**
 * Ported from legacy models/PurchaseOrder.php (APP-REPORT.md §7.2) — a
 * workflow-only document: NO inventory or party-ledger effect at any
 * status (draft/ordered/received/cancelled). There is no DB relationship to
 * Purchase Bills (verified: purchase_bills has no order_id column) — the
 * "Create Bill from this Order" button on the detail view is a pure UI
 * convenience that pre-fills the New Purchase Bill form via a query string,
 * not a real link. `orderNumber` auto-suggests (nextFixedPrefixNumber) but
 * stays free-text with an application-level uniqueness check (legacy has no
 * DB unique constraint on it either) — see ../../../../db/schema/
 * organization.js's numbering note.
 */

function canAccessPurchase(context) {
  return context.accessibleModules.includes("purchase");
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

const orderSchema = z.object({
  orderNumber: z.string().trim().min(1, "orderNumberRequired").max(50, "orderNumberTooLong"),
  orderDate: z.string().trim().min(1, "orderDateRequired"),
  expectedDate: z.string().trim().optional().or(z.literal("")),
  partyId: z.coerce.number().int().positive("partyRequired"),
  supplierName: z.string().trim().max(225).optional().or(z.literal("")),
  supplierAddress: z.string().trim().max(2000).optional().or(z.literal("")),
  panNumber: z.string().trim().max(50).optional().or(z.literal("")),
  warehouseId: z.coerce.number().int().positive().nullable().optional(),
  discType: z.enum(["percent", "amount"]).default("percent"),
  discValue: z.coerce.number().min(0, "somethingWentWrong").default(0),
  isVatApplicable: z.boolean().default(false),
  vatPercent: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  status: z.enum(["draft", "ordered", "received", "cancelled"]).default("ordered"),
  lines: z.array(lineSchema).min(1, "atLeastOneLineRequired"),
});

async function orderNumberExists(db, orderNumber, exceptId) {
  const where = exceptId
    ? and(eq(purchaseOrders.orderNumber, orderNumber), ne(purchaseOrders.id, exceptId))
    : eq(purchaseOrders.orderNumber, orderNumber);
  const existing = await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(where).limit(1);
  return existing.length > 0;
}

// Recomputes every line + document total server-side from the submitted
// line rows — never trust a client-posted total (AGENTS.md §5). Returns the
// rows shaped for insert plus the header totals.
function computeOrderTotals(data) {
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

function orderHeaderValues(data, documentTotals) {
  return {
    orderNumber: data.orderNumber,
    orderDate: data.orderDate,
    expectedDate: data.expectedDate || null,
    partyId: data.partyId,
    supplierName: data.supplierName || null,
    supplierAddress: data.supplierAddress || null,
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

async function insertOrderLines(db, orderId, computedLines) {
  await db.insert(purchaseOrderDetails).values(
    computedLines.map((line) => ({
      orderId,
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

export async function listPurchaseOrders(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({
      id: purchaseOrders.id,
      orderNumber: purchaseOrders.orderNumber,
      orderDate: purchaseOrders.orderDate,
      expectedDate: purchaseOrders.expectedDate,
      partyId: purchaseOrders.partyId,
      partyName: parties.name,
      warehouseId: purchaseOrders.warehouseId,
      warehouseName: warehouses.name,
      totalAmount: purchaseOrders.totalAmount,
      status: purchaseOrders.status,
      createdAt: purchaseOrders.createdAt,
    })
    .from(purchaseOrders)
    .innerJoin(parties, eq(purchaseOrders.partyId, parties.id))
    .leftJoin(warehouses, eq(purchaseOrders.warehouseId, warehouses.id))
    .orderBy(desc(purchaseOrders.id));
}

export async function getPurchaseOrderDetail(companySlug, orderId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const id = Number(orderId);

  const [order] = await db
    .select({
      id: purchaseOrders.id,
      orderNumber: purchaseOrders.orderNumber,
      orderDate: purchaseOrders.orderDate,
      expectedDate: purchaseOrders.expectedDate,
      partyId: purchaseOrders.partyId,
      partyName: parties.name,
      supplierName: purchaseOrders.supplierName,
      supplierAddress: purchaseOrders.supplierAddress,
      panNumber: purchaseOrders.panNumber,
      warehouseId: purchaseOrders.warehouseId,
      warehouseName: warehouses.name,
      subtotal: purchaseOrders.subtotal,
      discType: purchaseOrders.discType,
      discPercent: purchaseOrders.discPercent,
      discAmount: purchaseOrders.discAmount,
      vatPercent: purchaseOrders.vatPercent,
      isVatApplicable: purchaseOrders.isVatApplicable,
      vatAmount: purchaseOrders.vatAmount,
      totalAmount: purchaseOrders.totalAmount,
      notes: purchaseOrders.notes,
      status: purchaseOrders.status,
      createdAt: purchaseOrders.createdAt,
    })
    .from(purchaseOrders)
    .innerJoin(parties, eq(purchaseOrders.partyId, parties.id))
    .leftJoin(warehouses, eq(purchaseOrders.warehouseId, warehouses.id))
    .where(eq(purchaseOrders.id, id))
    .limit(1);
  if (!order) return null;

  const lines = await db
    .select({
      id: purchaseOrderDetails.id,
      itemId: purchaseOrderDetails.itemId,
      itemName: items.name,
      variantId: purchaseOrderDetails.variantId,
      variantName: attributeValues.name,
      unitId: purchaseOrderDetails.unitId,
      unitCode: units.code,
      quantity: purchaseOrderDetails.quantity,
      rate: purchaseOrderDetails.rate,
      discType: purchaseOrderDetails.discType,
      discPercent: purchaseOrderDetails.discPercent,
      discAmount: purchaseOrderDetails.discAmount,
      lineSubtotal: purchaseOrderDetails.lineSubtotal,
      lineTotal: purchaseOrderDetails.lineTotal,
    })
    .from(purchaseOrderDetails)
    .innerJoin(items, eq(purchaseOrderDetails.itemId, items.id))
    .innerJoin(units, eq(purchaseOrderDetails.unitId, units.id))
    .leftJoin(attributeValues, eq(purchaseOrderDetails.variantId, attributeValues.id))
    .where(eq(purchaseOrderDetails.orderId, id));

  return { order, lines };
}

// Dropdown/picker data for the create/edit form — suppliers (Supplier/Both
// parties), warehouses, items with their unit(s) and purchase price
// (defaults a new line's rate), all attribute values (see order-form.jsx's
// note on why the variant picker isn't scoped per-item), and the
// organization's default VAT settings to pre-fill a brand-new document.
export async function getPurchaseOrderFormData(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const secondaryUnits = alias(units, "secondary_units");

  const [partyRows, warehouseRows, itemRows, unitRows, attributeValueRows, [settingsRow], suggestedOrderNumber] =
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
      db.select({ defaultVatEnabled: settings.defaultVatEnabled, defaultVatPercent: settings.defaultVatPercent }).from(settings).limit(1),
      nextFixedPrefixNumber(db, { table: purchaseOrders, idColumn: purchaseOrders.id, prefix: "PO" }),
    ]);

  return {
    parties: partyRows,
    warehouses: warehouseRows,
    items: itemRows,
    units: unitRows,
    attributeValues: attributeValueRows,
    defaultVatEnabled: settingsRow?.defaultVatEnabled === 1,
    defaultVatPercent: Number(settingsRow?.defaultVatPercent ?? 13),
    suggestedOrderNumber,
  };
}

export async function createPurchaseOrderAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  if (await orderNumberExists(db, data.orderNumber)) {
    return { ok: false, fieldErrors: { orderNumber: ["orderNumberExists"] } };
  }

  const { computedLines, documentTotals } = computeOrderTotals(data);

  const [{ id: orderId }] = await db.insert(purchaseOrders).values(orderHeaderValues(data, documentTotals)).$returningId();
  await insertOrderLines(db, orderId, computedLines);

  revalidatePath(`/${companySlug}/purchase/orders`);
  return { ok: true, message: "purchaseOrderCreated", id: orderId };
}

export async function updatePurchaseOrderAction(companySlug, orderId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(orderId);
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "purchaseOrderNotFound" };
  }
  if (await orderNumberExists(db, data.orderNumber, id)) {
    return { ok: false, fieldErrors: { orderNumber: ["orderNumberExists"] } };
  }

  const { computedLines, documentTotals } = computeOrderTotals(data);

  await db.update(purchaseOrders).set(orderHeaderValues(data, documentTotals)).where(eq(purchaseOrders.id, id));
  await db.delete(purchaseOrderDetails).where(eq(purchaseOrderDetails.orderId, id));
  await insertOrderLines(db, id, computedLines);

  revalidatePath(`/${companySlug}/purchase/orders`);
  revalidatePath(`/${companySlug}/purchase/orders/${id}`);
  return { ok: true, message: "purchaseOrderUpdated" };
}

// Pure status transition (draft/ordered/received/cancelled) — an order
// never touches inventory or the party ledger at any status, so this is
// nothing more than a field update (see file header comment).
export async function updatePurchaseOrderStatusAction(companySlug, orderId, status) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, formError: "notAllowed" };
  }
  if (!["draft", "ordered", "received", "cancelled"].includes(status)) {
    return { ok: false, formError: "somethingWentWrong" };
  }

  const id = Number(orderId);
  const db = getOrganizationDb(context.session.organizationDbName);
  const [existing] = await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  if (!existing) {
    return { ok: false, formError: "purchaseOrderNotFound" };
  }

  await db.update(purchaseOrders).set({ status }).where(eq(purchaseOrders.id, id));

  revalidatePath(`/${companySlug}/purchase/orders`);
  revalidatePath(`/${companySlug}/purchase/orders/${id}`);
  return { ok: true, message: "purchaseOrderStatusUpdated" };
}

export async function deletePurchaseOrdersAction(companySlug, orderIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const ids = (Array.isArray(orderIds) ? orderIds : [orderIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) {
    return { ok: false, formError: "purchaseOrderNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  // Safe hard delete — orders never touch inventory or the party ledger and
  // nothing else references purchase_orders (no order_id column anywhere),
  // so there's no reversal or referential guard needed, unlike bills/debit
  // notes.
  await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, ids));

  revalidatePath(`/${companySlug}/purchase/orders`);
  return { ok: true, message: "purchaseOrdersDeleted", count: ids.length };
}
