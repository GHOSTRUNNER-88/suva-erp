"use server";

import { desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  attributeValues,
  attributes,
  deliveryChallanItems,
  deliveryChallans,
  items,
  parties,
  units,
  warehouses,
} from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { applyInventoryChange, getInventoryRow, getNegativeStockAction } from "@/lib/inventory";
import { nextWarehouseScopedNumber } from "@/lib/document-numbering";

/**
 * Ported from legacy models/DeliveryChallan.php (APP-REPORT.md §7.1,
 * verified in full) — a pure dispatch/paper-trail document, no pricing
 * columns at all (see ../../../../db/schema/organization.js's comment above
 * deliveryChallans for the full rundown). Two independent axes worth calling
 * out because they're easy to conflate:
 *
 * - `sourceType`/`sourceId` is just a display label ("Invoice #123" /
 *   "Bill #123" / "Manual") — an unenforced polymorphic reference, no FK.
 *   It does NOT by itself mean stock moves.
 * - `stockDeducted` (from the create form's `deductStock` checkbox) is what
 *   actually controls whether THIS challan moves inventory. A challan raised
 *   for an invoice that already deducted stock itself should leave
 *   deductStock unchecked — the two are independent, the user can override
 *   either way.
 *
 * `challanNumber` is ALWAYS server-generated (nextWarehouseScopedNumber,
 * fixedPrefix "DC", infix "DC" -> "DC-DC-0001") and never client-editable —
 * unlike orders/quotations, there is no free-text override here, matching
 * legacy's create_delivery_challan() exactly (including the redundant
 * "DC-DC-" — a verified legacy quirk, not a bug, see the schema comment).
 *
 * No DB transactions are used anywhere in this codebase (see bank-accounts/
 * actions.js's transfer, items/actions.js's multi-step writes) so instead of
 * wrapping stock mutation in one, every write path here either (a) does a
 * feasibility dry run first and only writes once it's guaranteed safe for
 * the "block negative stock" setting, or (b) is a pure reversal (positive
 * delta), which can never fail the negative-stock gate. Once a challan's
 * stock has actually been deducted (stockDeducted=1), its warehouse/lines/
 * deductStock become locked in updateDeliveryChallanAction — editing them in
 * place would need a reverse-then-reapply with no transaction to guarantee
 * consistency if the second half failed. Cancel and recreate instead; this
 * is a deliberate judgment call, not something the legacy port required.
 */

function canAccessSales(context) {
  return context.accessibleModules.includes("sales");
}

const lineSchema = z.object({
  itemId: z.coerce.number().int().positive("itemRequired"),
  variantId: z.coerce.number().int().positive().nullable().optional(),
  unitId: z.coerce.number().int().positive().nullable().optional(),
  quantity: z.coerce.number().positive("quantityRequired"),
  itemNote: z.string().trim().max(255).optional().or(z.literal("")),
});

const challanSchema = z
  .object({
    challanDate: z.string().trim().min(1, "challanDateRequired"),
    partyId: z.coerce.number().int().positive("partyRequired"),
    warehouseId: z.coerce.number().int().positive().nullable().optional(),
    sourceType: z.enum(["manual", "sale", "purchase"]).default("manual"),
    sourceId: z.coerce.number().int().positive().nullable().optional(),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    // "cancelled" is deliberately not a selectable value here — cancelling
    // has stock-reversal side effects and only happens through the
    // dedicated cancelDeliveryChallanAction below.
    status: z.enum(["pending", "delivered"]).default("pending"),
    deductStock: z.boolean().default(false),
    lines: z.array(lineSchema).min(1, "atLeastOneLineRequired"),
  })
  .superRefine((data, ctx) => {
    if (data.deductStock && data.warehouseId && data.lines.some((line) => !line.unitId)) {
      ctx.addIssue({ path: ["lines"], code: z.ZodIssueCode.custom, message: "unitRequiredForStockDeduction" });
    }
  });

// Dry-run only (no writes) — checks every line against current stock when
// the organization's negativeStockAction is "block" (2), so a doc-wide
// failure never leaves a partial deduction behind. Warn (1) / allow (0)
// modes need no pre-check, since applyInventoryChange itself never blocks
// those.
async function checkChallanStockFeasible(db, warehouseId, lines) {
  const action = await getNegativeStockAction(db);
  if (action !== 2) return true;
  for (const line of lines) {
    const existingRow = await getInventoryRow(db, line.itemId, line.variantId || 0, warehouseId);
    const currentQuantity = existingRow ? Number(existingRow.quantity) : 0;
    if (currentQuantity - line.quantity < 0) return false;
  }
  return true;
}

async function applyChallanStockOut(db, warehouseId, lines, note) {
  const warnings = [];
  for (const line of lines) {
    const result = await applyInventoryChange(db, {
      itemId: line.itemId,
      variantId: line.variantId || 0,
      warehouseId,
      unitId: line.unitId,
      delta: -Math.abs(line.quantity),
      changeType: "challan_out",
      note,
    });
    if (result?.warning) warnings.push(result.warning);
  }
  return warnings;
}

// Reversal (positive delta) can never trip the negative-stock gate, so no
// feasibility check is needed here.
async function reverseChallanStockIn(db, warehouseId, lines, note) {
  for (const line of lines) {
    await applyInventoryChange(db, {
      itemId: line.itemId,
      variantId: line.variantId || 0,
      warehouseId,
      unitId: line.unitId,
      delta: Math.abs(line.quantity),
      changeType: "challan_in",
      note,
    });
  }
}

function roundLines(lines) {
  return lines.map((line) => ({
    ...line,
    quantity: Math.round(Number(line.quantity) || 0),
    variantId: line.variantId || null,
    unitId: line.unitId || null,
  }));
}

export async function listDeliveryChallans(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({
      id: deliveryChallans.id,
      challanNumber: deliveryChallans.challanNumber,
      challanDate: deliveryChallans.challanDate,
      partyId: deliveryChallans.partyId,
      partyName: parties.name,
      warehouseId: deliveryChallans.warehouseId,
      warehouseName: warehouses.name,
      sourceType: deliveryChallans.sourceType,
      sourceId: deliveryChallans.sourceId,
      status: deliveryChallans.status,
      stockDeducted: deliveryChallans.stockDeducted,
      createdAt: deliveryChallans.createdAt,
    })
    .from(deliveryChallans)
    .innerJoin(parties, eq(deliveryChallans.partyId, parties.id))
    .leftJoin(warehouses, eq(deliveryChallans.warehouseId, warehouses.id))
    .orderBy(desc(deliveryChallans.id));
}

export async function getDeliveryChallanDetail(companySlug, challanId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const id = Number(challanId);

  const [challan] = await db
    .select({
      id: deliveryChallans.id,
      challanNumber: deliveryChallans.challanNumber,
      challanDate: deliveryChallans.challanDate,
      partyId: deliveryChallans.partyId,
      partyName: parties.name,
      warehouseId: deliveryChallans.warehouseId,
      warehouseName: warehouses.name,
      sourceType: deliveryChallans.sourceType,
      sourceId: deliveryChallans.sourceId,
      notes: deliveryChallans.notes,
      status: deliveryChallans.status,
      stockDeducted: deliveryChallans.stockDeducted,
      createdAt: deliveryChallans.createdAt,
    })
    .from(deliveryChallans)
    .innerJoin(parties, eq(deliveryChallans.partyId, parties.id))
    .leftJoin(warehouses, eq(deliveryChallans.warehouseId, warehouses.id))
    .where(eq(deliveryChallans.id, id))
    .limit(1);
  if (!challan) return null;

  // No FK on variantId/unitId here (matches legacy exactly, see schema
  // comment) — the leftJoins below still resolve display names by id, they
  // just can't rely on referential integrity if a value later gets deleted.
  const lines = await db
    .select({
      id: deliveryChallanItems.id,
      itemId: deliveryChallanItems.itemId,
      itemName: items.name,
      variantId: deliveryChallanItems.variantId,
      variantName: attributeValues.name,
      unitId: deliveryChallanItems.unitId,
      unitCode: units.code,
      quantity: deliveryChallanItems.quantity,
      itemNote: deliveryChallanItems.itemNote,
    })
    .from(deliveryChallanItems)
    .innerJoin(items, eq(deliveryChallanItems.itemId, items.id))
    .leftJoin(units, eq(deliveryChallanItems.unitId, units.id))
    .leftJoin(attributeValues, eq(deliveryChallanItems.variantId, attributeValues.id))
    .where(eq(deliveryChallanItems.challanId, id));

  return { challan, lines };
}

// Dropdown/picker data for the create/edit form — no VAT/price data needed
// (challans carry no money) and no suggested number (always server-
// generated at insert time, see file header).
export async function getDeliveryChallanFormData(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const secondaryUnits = alias(units, "secondary_units");

  const [partyRows, warehouseRows, itemRows, unitRows, attributeValueRows] = await Promise.all([
    db
      .select({ id: parties.id, name: parties.name, type: parties.type })
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
      })
      .from(items)
      .innerJoin(units, eq(items.primaryUnitId, units.id))
      .leftJoin(secondaryUnits, eq(items.secondaryUnitId, secondaryUnits.id)),
    db.select({ id: units.id, name: units.name, code: units.code }).from(units),
    db
      .select({ id: attributeValues.id, name: attributeValues.name, attributeName: attributes.name })
      .from(attributeValues)
      .innerJoin(attributes, eq(attributeValues.attrId, attributes.id)),
  ]);

  return { parties: partyRows, warehouses: warehouseRows, items: itemRows, units: unitRows, attributeValues: attributeValueRows };
}

export async function createDeliveryChallanAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = challanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);
  const computedLines = roundLines(data.lines);
  const willDeductStock = data.deductStock && Boolean(data.warehouseId);

  if (willDeductStock && !(await checkChallanStockFeasible(db, data.warehouseId, computedLines))) {
    return { ok: false, formError: "insufficientStockForChallan" };
  }

  const challanNumber = await nextWarehouseScopedNumber(db, {
    table: deliveryChallans,
    idColumn: deliveryChallans.id,
    warehousesTable: warehouses,
    warehouseId: data.warehouseId || null,
    fixedPrefix: "DC",
    infix: "DC",
  });

  const [{ id: challanId }] = await db
    .insert(deliveryChallans)
    .values({
      challanNumber,
      challanDate: data.challanDate,
      partyId: data.partyId,
      warehouseId: data.warehouseId || null,
      sourceType: data.sourceType,
      sourceId: data.sourceId || null,
      notes: data.notes || null,
      status: data.status,
      stockDeducted: willDeductStock ? 1 : 0,
    })
    .$returningId();

  await db.insert(deliveryChallanItems).values(
    computedLines.map((line) => ({
      challanId,
      itemId: line.itemId,
      variantId: line.variantId,
      unitId: line.unitId,
      quantity: line.quantity.toFixed(4),
      itemNote: line.itemNote || null,
    }))
  );

  let warning = null;
  if (willDeductStock) {
    const warnings = await applyChallanStockOut(db, data.warehouseId, computedLines, `Delivery Challan ${challanNumber}`);
    warning = warnings[0] ?? null;
  }

  revalidatePath(`/${companySlug}/sales/delivery-challans`);
  return { ok: true, message: "deliveryChallanCreated", id: challanId, warning };
}

export async function updateDeliveryChallanAction(companySlug, challanId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = challanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(challanId);
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db.select().from(deliveryChallans).where(eq(deliveryChallans.id, id)).limit(1);
  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "deliveryChallanNotFound" };
  }
  if (existing.status === "cancelled") {
    return { ok: false, formError: "challanAlreadyCancelled" };
  }

  // Locked once stock has actually moved — see file header for why.
  const locked = existing.stockDeducted === 1;
  const warehouseId = locked ? existing.warehouseId : data.warehouseId || null;

  let computedLines;
  if (locked) {
    const existingItems = await db.select().from(deliveryChallanItems).where(eq(deliveryChallanItems.challanId, id));
    computedLines = existingItems.map((item) => ({
      itemId: item.itemId,
      variantId: item.variantId,
      unitId: item.unitId,
      quantity: Number(item.quantity),
      itemNote: item.itemNote,
    }));
  } else {
    computedLines = roundLines(data.lines);
  }

  let stockDeducted = existing.stockDeducted;
  let warning = null;
  if (!locked) {
    const willDeductStock = data.deductStock && Boolean(warehouseId);
    if (willDeductStock && !(await checkChallanStockFeasible(db, warehouseId, computedLines))) {
      return { ok: false, formError: "insufficientStockForChallan" };
    }
    stockDeducted = willDeductStock ? 1 : 0;
  }

  await db
    .update(deliveryChallans)
    .set({
      challanDate: data.challanDate,
      partyId: data.partyId,
      warehouseId,
      sourceType: data.sourceType,
      sourceId: data.sourceId || null,
      notes: data.notes || null,
      status: data.status,
      stockDeducted,
    })
    .where(eq(deliveryChallans.id, id));

  if (!locked) {
    await db.delete(deliveryChallanItems).where(eq(deliveryChallanItems.challanId, id));
    await db.insert(deliveryChallanItems).values(
      computedLines.map((line) => ({
        challanId: id,
        itemId: line.itemId,
        variantId: line.variantId,
        unitId: line.unitId,
        quantity: line.quantity.toFixed(4),
        itemNote: line.itemNote || null,
      }))
    );
    if (stockDeducted === 1) {
      const warnings = await applyChallanStockOut(db, warehouseId, computedLines, `Delivery Challan ${existing.challanNumber}`);
      warning = warnings[0] ?? null;
    }
  }

  revalidatePath(`/${companySlug}/sales/delivery-challans`);
  revalidatePath(`/${companySlug}/sales/delivery-challans/${id}`);
  return { ok: true, message: "deliveryChallanUpdated", warning };
}

// Pure pending<->delivered transition, no side effects (see file header) —
// "cancelled" is intentionally excluded, see cancelDeliveryChallanAction.
export async function updateDeliveryChallanStatusAction(companySlug, challanId, status) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, formError: "notAllowed" };
  }
  if (!["pending", "delivered"].includes(status)) {
    return { ok: false, formError: "somethingWentWrong" };
  }

  const id = Number(challanId);
  const db = getOrganizationDb(context.session.organizationDbName);
  const [existing] = await db
    .select({ id: deliveryChallans.id, status: deliveryChallans.status })
    .from(deliveryChallans)
    .where(eq(deliveryChallans.id, id))
    .limit(1);
  if (!existing) {
    return { ok: false, formError: "deliveryChallanNotFound" };
  }
  if (existing.status === "cancelled") {
    return { ok: false, formError: "challanAlreadyCancelled" };
  }

  await db.update(deliveryChallans).set({ status }).where(eq(deliveryChallans.id, id));

  revalidatePath(`/${companySlug}/sales/delivery-challans`);
  revalidatePath(`/${companySlug}/sales/delivery-challans/${id}`);
  return { ok: true, message: "deliveryChallanStatusUpdated" };
}

// Reverses inventory (if stockDeducted) and marks the challan cancelled —
// the only path allowed to move a challan into "cancelled", since it has a
// real side effect (see ../../../../db/schema/organization.js's comment
// above deliveryChallans).
export async function cancelDeliveryChallanAction(companySlug, challanId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const id = Number(challanId);
  const db = getOrganizationDb(context.session.organizationDbName);
  const [existing] = await db.select().from(deliveryChallans).where(eq(deliveryChallans.id, id)).limit(1);
  if (!existing) {
    return { ok: false, formError: "deliveryChallanNotFound" };
  }
  if (existing.status === "cancelled") {
    return { ok: false, formError: "challanAlreadyCancelled" };
  }

  if (existing.stockDeducted === 1 && existing.warehouseId) {
    const existingItems = await db.select().from(deliveryChallanItems).where(eq(deliveryChallanItems.challanId, id));
    const lines = existingItems.map((item) => ({
      itemId: item.itemId,
      variantId: item.variantId,
      unitId: item.unitId,
      quantity: Number(item.quantity),
    }));
    await reverseChallanStockIn(db, existing.warehouseId, lines, `Cancelled Delivery Challan ${existing.challanNumber}`);
  }

  await db.update(deliveryChallans).set({ status: "cancelled", stockDeducted: 0 }).where(eq(deliveryChallans.id, id));

  revalidatePath(`/${companySlug}/sales/delivery-challans`);
  revalidatePath(`/${companySlug}/sales/delivery-challans/${id}`);
  return { ok: true, message: "deliveryChallanCancelled" };
}

export async function deleteDeliveryChallansAction(companySlug, challanIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessSales(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const ids = (Array.isArray(challanIds) ? challanIds : [challanIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) {
    return { ok: false, formError: "deliveryChallanNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  const rows = await db.select().from(deliveryChallans).where(inArray(deliveryChallans.id, ids));

  // Reverse stock first (per file header/schema comment), then remove the
  // item rows, then the header — the header delete cascades the item rows
  // for us (fk_delivery_challan_items_challan ON DELETE CASCADE), this loop
  // only has to handle the inventory side, which cascade can't do.
  for (const row of rows) {
    if (row.stockDeducted === 1 && row.warehouseId) {
      const existingItems = await db.select().from(deliveryChallanItems).where(eq(deliveryChallanItems.challanId, row.id));
      const lines = existingItems.map((item) => ({
        itemId: item.itemId,
        variantId: item.variantId,
        unitId: item.unitId,
        quantity: Number(item.quantity),
      }));
      await reverseChallanStockIn(db, row.warehouseId, lines, `Deleted Delivery Challan ${row.challanNumber}`);
    }
  }

  await db.delete(deliveryChallans).where(inArray(deliveryChallans.id, ids));

  revalidatePath(`/${companySlug}/sales/delivery-challans`);
  return { ok: true, message: "deliveryChallansDeleted", count: ids.length };
}
