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
  salesOrderDetails,
  salesOrders,
  settings,
  units,
  warehouses,
} from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { calcDocumentTotals, calcLineTotal } from "@/lib/money";
import { nextFixedPrefixNumber } from "@/lib/document-numbering";

/**
 * Ported from legacy models/SalesOrder.php (APP-REPORT.md §7.1) — a
 * workflow-only document: NO inventory or party-ledger effect at any status
 * (draft/confirmed/converted/cancelled). There is no DB relationship to Sales
 * Invoices (verified: sales_invoices has no order_id column) — the "Create
 * Invoice from this Order" button on the detail view is a pure UI
 * convenience that pre-fills the New Sales Invoice form via a query string
 * (partyId, warehouseId, billingName, billingAddress, panNumber, notes,
 * fromOrderId, lines — lines is a JSON-encoded array of
 * {itemId, variantId, unitId, quantity, rate, discType, discValue}), not a
 * real link — same convention purchase/orders uses for "Create Bill from
 * this Order". `orderNumber` auto-suggests (nextFixedPrefixNumber) but stays
 * free-text with an application-level uniqueness check (legacy has no DB
 * unique constraint on it either) — see ../../../../db/schema/
 * organization.js's numbering note. Mirrors purchase/orders/actions.js's
 * shape closely (sibling document, same workflow-only structure) so the two
 * modules stay consistent for anyone working across both.
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

const orderSchema = z.object({
  orderNumber: z.string().trim().min(1, "orderNumberRequired").max(50, "orderNumberTooLong"),
  orderDate: z.string().trim().min(1, "orderDateRequired"),
  expectedDate: z.string().trim().optional().or(z.literal("")),
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
  status: z.enum(["draft", "confirmed", "converted", "cancelled"]).default("confirmed"),
  lines: z.array(lineSchema).min(1, "atLeastOneLineRequired"),
});

async function orderNumberExists(db, orderNumber, exceptId) {
  const where = exceptId
    ? and(eq(salesOrders.orderNumber, orderNumber), ne(salesOrders.id, exceptId))
    : eq(salesOrders.orderNumber, orderNumber);
  const existing = await db.select({ id: salesOrders.id }).from(salesOrders).where(where).limit(1);
  return existing.length > 0;
}

// Recomputes every line + document total server-side from the submitted
// line rows — never trust a client-posted total (AGENTS.md §5). Returns the
// rows shaped for insert plus the header totals. Quantity is a plain INT
// column on salesOrderDetails (legacy never stored fractional order
// quantities) — rounded here, matching purchase/orders' same quirk.
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

async function insertOrderLines(db, orderId, computedLines) {
  await db.insert(salesOrderDetails).values(
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

export async function listSalesOrders(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({
      id: salesOrders.id,
      orderNumber: salesOrders.orderNumber,
      orderDate: salesOrders.orderDate,
      expectedDate: salesOrders.expectedDate,
      partyId: salesOrders.partyId,
      partyName: parties.name,
      warehouseId: salesOrders.warehouseId,
      warehouseName: warehouses.name,
      totalAmount: salesOrders.totalAmount,
      status: salesOrders.status,
      createdAt: salesOrders.createdAt,
    })
    .from(salesOrders)
    .innerJoin(parties, eq(salesOrders.partyId, parties.id))
    .leftJoin(warehouses, eq(salesOrders.warehouseId, warehouses.id))
    .orderBy(desc(salesOrders.id));
}

export async function getSalesOrderDetail(companySlug, orderId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const id = Number(orderId);

  const [order] = await db
    .select({
      id: salesOrders.id,
      orderNumber: salesOrders.orderNumber,
      orderDate: salesOrders.orderDate,
      expectedDate: salesOrders.expectedDate,
      partyId: salesOrders.partyId,
      partyName: parties.name,
      billingName: salesOrders.billingName,
      billingAddress: salesOrders.billingAddress,
      panNumber: salesOrders.panNumber,
      warehouseId: salesOrders.warehouseId,
      warehouseName: warehouses.name,
      subtotal: salesOrders.subtotal,
      discType: salesOrders.discType,
      discPercent: salesOrders.discPercent,
      discAmount: salesOrders.discAmount,
      vatPercent: salesOrders.vatPercent,
      isVatApplicable: salesOrders.isVatApplicable,
      vatAmount: salesOrders.vatAmount,
      totalAmount: salesOrders.totalAmount,
      notes: salesOrders.notes,
      status: salesOrders.status,
      createdAt: salesOrders.createdAt,
    })
    .from(salesOrders)
    .innerJoin(parties, eq(salesOrders.partyId, parties.id))
    .leftJoin(warehouses, eq(salesOrders.warehouseId, warehouses.id))
    .where(eq(salesOrders.id, id))
    .limit(1);
  if (!order) return null;

  const lines = await db
    .select({
      id: salesOrderDetails.id,
      itemId: salesOrderDetails.itemId,
      itemName: items.name,
      variantId: salesOrderDetails.variantId,
      variantName: attributeValues.name,
      unitId: salesOrderDetails.unitId,
      unitCode: units.code,
      quantity: salesOrderDetails.quantity,
      rate: salesOrderDetails.rate,
      discType: salesOrderDetails.discType,
      discPercent: salesOrderDetails.discPercent,
      discAmount: salesOrderDetails.discAmount,
      lineSubtotal: salesOrderDetails.lineSubtotal,
      lineTotal: salesOrderDetails.lineTotal,
    })
    .from(salesOrderDetails)
    .innerJoin(items, eq(salesOrderDetails.itemId, items.id))
    .innerJoin(units, eq(salesOrderDetails.unitId, units.id))
    .leftJoin(attributeValues, eq(salesOrderDetails.variantId, attributeValues.id))
    .where(eq(salesOrderDetails.orderId, id));

  return { order, lines };
}

// Dropdown/picker data for the create/edit form — customers (Customer/Both
// parties), warehouses, items with their unit(s) and selling price (defaults
// a new line's rate), all attribute values (variant picker isn't scoped per
// item — same simplification purchase/orders uses, see that module's note),
// and the organization's default VAT settings to pre-fill a brand-new
// document.
export async function getSalesOrderFormData(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const secondaryUnits = alias(units, "secondary_units");

  const [partyRows, warehouseRows, itemRows, unitRows, attributeValueRows, [settingsRow], suggestedOrderNumber] =
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
      nextFixedPrefixNumber(db, { table: salesOrders, idColumn: salesOrders.id, prefix: "SO" }),
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

export async function createSalesOrderAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
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

  const [{ id: orderId }] = await db.insert(salesOrders).values(orderHeaderValues(data, documentTotals)).$returningId();
  await insertOrderLines(db, orderId, computedLines);

  revalidatePath(`/${companySlug}/sales/orders`);
  return { ok: true, message: "salesOrderCreated", id: orderId };
}

export async function updateSalesOrderAction(companySlug, orderId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(orderId);
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db.select({ id: salesOrders.id }).from(salesOrders).where(eq(salesOrders.id, id)).limit(1);
  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "salesOrderNotFound" };
  }
  if (await orderNumberExists(db, data.orderNumber, id)) {
    return { ok: false, fieldErrors: { orderNumber: ["orderNumberExists"] } };
  }

  const { computedLines, documentTotals } = computeOrderTotals(data);

  await db.update(salesOrders).set(orderHeaderValues(data, documentTotals)).where(eq(salesOrders.id, id));
  await db.delete(salesOrderDetails).where(eq(salesOrderDetails.orderId, id));
  await insertOrderLines(db, id, computedLines);

  revalidatePath(`/${companySlug}/sales/orders`);
  revalidatePath(`/${companySlug}/sales/orders/${id}`);
  return { ok: true, message: "salesOrderUpdated" };
}

// Pure status transition (draft/confirmed/converted/cancelled) — an order
// never touches inventory or the party ledger at any status, so this is
// nothing more than a field update (see file header comment).
export async function updateSalesOrderStatusAction(companySlug, orderId, status) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, formError: "notAllowed" };
  }
  if (!["draft", "confirmed", "converted", "cancelled"].includes(status)) {
    return { ok: false, formError: "somethingWentWrong" };
  }

  const id = Number(orderId);
  const db = getOrganizationDb(context.session.organizationDbName);
  const [existing] = await db.select({ id: salesOrders.id }).from(salesOrders).where(eq(salesOrders.id, id)).limit(1);
  if (!existing) {
    return { ok: false, formError: "salesOrderNotFound" };
  }

  await db.update(salesOrders).set({ status }).where(eq(salesOrders.id, id));

  revalidatePath(`/${companySlug}/sales/orders`);
  revalidatePath(`/${companySlug}/sales/orders/${id}`);
  return { ok: true, message: "salesOrderStatusUpdated" };
}

export async function deleteSalesOrdersAction(companySlug, orderIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const ids = (Array.isArray(orderIds) ? orderIds : [orderIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) {
    return { ok: false, formError: "salesOrderNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  // Safe hard delete — orders never touch inventory or the party ledger and
  // nothing else references sales_orders (no order_id column anywhere), so
  // there's no reversal or referential guard needed, unlike invoices/notes.
  await db.delete(salesOrders).where(inArray(salesOrders.id, ids));

  revalidatePath(`/${companySlug}/sales/orders`);
  return { ok: true, message: "salesOrdersDeleted", count: ids.length };
}
