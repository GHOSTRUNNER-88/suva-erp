"use server";

import { and, asc, count, desc, eq, inArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { revalidatePath } from "next/cache";
import {
  attributeValues,
  inventories,
  itemAttributeValues,
  itemCategories,
  itemPartyGroupPrices,
  items,
  units,
  warehouses,
} from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { z } from "zod";

/**
 * Ported from legacy models/Item.php (create_item/update_item) and
 * models/Warehouse.php (create_warehouse/update_warehouse) — same fields,
 * same defaults. Variant/attribute support is deliberately not ported yet,
 * see ../../../db/schema/organization.js. conversionFactor/partyGroupPrices
 * are the two exceptions — narrowed ports of item_unit_conversions/
 * item_party_level_prices (see that file's comment for why).
 */
const itemSchema = z
  .object({
    name: z.string().trim().min(1, "itemNameRequired").max(225, "itemNameTooLong"),
    categoryId: z.coerce.number().int().positive().nullable().optional(),
    barcodeInput: z.boolean().default(false),
    barcodeValue: z.string().trim().max(225).optional().or(z.literal("")),
    primaryUnitId: z.coerce.number().int().positive("primaryUnitRequired"),
    secondaryUnitId: z.coerce.number().int().positive().nullable().optional(),
    // How many primaryUnit per 1 secondaryUnit — only required/meaningful
    // once a secondary unit is actually set, see superRefine below.
    conversionFactor: z.coerce.number().int().positive().nullable().optional(),
    purchasePrice: z.coerce.number().min(0, "somethingWentWrong").default(0),
    sellingPrice: z.coerce.number().min(0, "somethingWentWrong").default(0),
    // Sparse — only entries the caller actually wants to override; entries
    // for groups left blank in the form are simply not included.
    partyGroupPrices: z
      .array(
        z.object({
          partyGroupId: z.coerce.number().int().positive(),
          sellingPrice: z.coerce.number().min(0, "somethingWentWrong"),
        })
      )
      .default([]),
    // Which attribute values (e.g. Red under Color) apply to this item —
    // full-replace sync, see syncItemAttributeValues below.
    attributeValueIds: z.array(z.coerce.number().int().positive()).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.secondaryUnitId && !data.conversionFactor) {
      ctx.addIssue({ path: ["conversionFactor"], code: z.ZodIssueCode.custom, message: "conversionFactorRequired" });
    }
  });

const itemCategorySchema = z.object({
  name: z.string().trim().min(1, "itemCategoryNameRequired").max(150, "itemCategoryNameTooLong"),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  icon: z.string().trim().max(50).optional().or(z.literal("")),
});

const WAREHOUSE_TYPES = ["Godown", "Retail Store", "Wholesale Store", "Assembly Plant", "Others"];

const warehouseSchema = z.object({
  name: z.string().trim().min(1, "warehouseNameRequired").max(225, "warehouseNameTooLong"),
  type: z.enum(WAREHOUSE_TYPES).default("Godown"),
  phoneNumber: z.string().trim().min(1, "phoneRequired").max(20, "phoneTooLong"),
  storeAddress: z.string().trim().max(225).optional().or(z.literal("")),
  isPrimary: z.boolean().default(false),
  invoicePrefix: z.string().trim().max(10).optional().or(z.literal("")),
});

function canAccessItems(context) {
  return context.accessibleModules.includes("items");
}

function normalizeInvoicePrefix(value) {
  return (value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

async function itemNameExists(db, name, exceptId) {
  const where = exceptId ? and(eq(items.name, name), ne(items.id, exceptId)) : eq(items.name, name);
  const existing = await db.select({ id: items.id }).from(items).where(where).limit(1);
  return existing.length > 0;
}

async function categoryNameExists(db, name, exceptId) {
  const where = exceptId
    ? and(eq(itemCategories.name, name), ne(itemCategories.id, exceptId))
    : eq(itemCategories.name, name);
  const existing = await db.select({ id: itemCategories.id }).from(itemCategories).where(where).limit(1);
  return existing.length > 0;
}

// Full-replace sync, same pattern legacy's Item.php already uses for the
// item's other dependent collections (sync_item_variants,
// sync_item_inventory_for_variants) — simpler and safer than diffing given
// how small/sparse this list is (at most one row per party group).
async function syncItemPartyGroupPrices(db, itemId, partyGroupPrices) {
  await db.delete(itemPartyGroupPrices).where(eq(itemPartyGroupPrices.itemId, itemId));
  if (partyGroupPrices.length > 0) {
    await db.insert(itemPartyGroupPrices).values(
      partyGroupPrices.map((entry) => ({
        itemId,
        partyGroupId: entry.partyGroupId,
        sellingPrice: entry.sellingPrice.toFixed(5),
      }))
    );
  }
}

// Full-replace sync, folded directly into createItemAction/updateItemAction
// (below) so it's atomic with the rest of the item save rather than a
// second client round-trip — mirrors syncItemPartyGroupPrices above and
// items/attributes/actions.js's setItemAttributeValuesAction (kept there as
// a standalone action for any caller that needs to sync values without a
// full item save).
async function syncItemAttributeValues(db, itemId, valueIds) {
  await db.delete(itemAttributeValues).where(eq(itemAttributeValues.itemId, itemId));
  if (valueIds.length > 0) {
    await db.insert(itemAttributeValues).values(valueIds.map((valueId) => ({ itemId, valueId })));
  }
}

// Ported from legacy sync_item_inventory_for_variants() (models/Item.php) —
// called right after syncItemAttributeValues so inventory rows track
// whatever attribute values are actually assigned. Key behaviors preserved
// exactly: (1) only ever INSERTs a missing (variant, warehouse) row at
// qty 0 — never touches a row that already exists, so re-syncing can never
// silently reset real stock; (2) once real variant rows exist, the
// leftover variantId=0 "no variant" placeholder is dropped, but only if it
// never accumulated stock (qty still 0); (3) removing a variant from an
// item does NOT delete its inventory row — that stock stays in the
// database, just orphaned, exactly like legacy (no data loss on a simple
// re-assignment).
async function syncItemInventoryForVariants(db, itemId, primaryUnitId, valueIds) {
  const allWarehouses = await db.select({ id: warehouses.id }).from(warehouses);
  if (allWarehouses.length === 0) return;

  const existingRows = await db
    .select({ variantId: inventories.variantId, warehouseId: inventories.warehouseId })
    .from(inventories)
    .where(eq(inventories.itemId, itemId));
  const existingKeys = new Set(existingRows.map((row) => `${row.variantId}:${row.warehouseId}`));

  if (valueIds.length > 0) {
    const toInsert = [];
    for (const warehouse of allWarehouses) {
      for (const valueId of valueIds) {
        if (!existingKeys.has(`${valueId}:${warehouse.id}`)) {
          toInsert.push({ itemId, variantId: valueId, warehouseId: warehouse.id, unitId: primaryUnitId, quantity: "0.0000" });
        }
      }
    }
    if (toInsert.length > 0) await db.insert(inventories).values(toInsert);
    await db
      .delete(inventories)
      .where(and(eq(inventories.itemId, itemId), eq(inventories.variantId, 0), eq(inventories.quantity, "0.0000")));
  } else {
    const toInsert = [];
    for (const warehouse of allWarehouses) {
      if (!existingKeys.has(`0:${warehouse.id}`)) {
        toInsert.push({ itemId, variantId: 0, warehouseId: warehouse.id, unitId: primaryUnitId, quantity: "0.0000" });
      }
    }
    if (toInsert.length > 0) await db.insert(inventories).values(toInsert);
  }
}

async function warehouseNameOrPhoneExists(db, name, phoneNumber, exceptId) {
  const nameWhere = exceptId
    ? and(eq(warehouses.name, name), ne(warehouses.id, exceptId))
    : eq(warehouses.name, name);
  const phoneWhere = exceptId
    ? and(eq(warehouses.phoneNumber, phoneNumber), ne(warehouses.id, exceptId))
    : eq(warehouses.phoneNumber, phoneNumber);
  const [nameHit, phoneHit] = await Promise.all([
    db.select({ id: warehouses.id }).from(warehouses).where(nameWhere).limit(1),
    db.select({ id: warehouses.id }).from(warehouses).where(phoneWhere).limit(1),
  ]);
  return { nameTaken: nameHit.length > 0, phoneTaken: phoneHit.length > 0 };
}

export async function listItems(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  const secondaryUnits = alias(units, "secondary_units");

  const rows = await db
    .select({
      id: items.id,
      name: items.name,
      categoryId: items.categoryId,
      categoryName: itemCategories.name,
      categoryIcon: itemCategories.icon,
      barcodeInput: items.barcodeInput,
      barcodeValue: items.barcodeValue,
      primaryUnitId: items.primaryUnitId,
      primaryUnitName: units.name,
      primaryUnitCode: units.code,
      secondaryUnitId: items.secondaryUnitId,
      secondaryUnitName: secondaryUnits.name,
      secondaryUnitCode: secondaryUnits.code,
      conversionFactor: items.conversionFactor,
      purchasePrice: items.purchasePrice,
      sellingPrice: items.sellingPrice,
      createdAt: items.createdAt,
    })
    .from(items)
    .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
    .innerJoin(units, eq(items.primaryUnitId, units.id))
    .leftJoin(secondaryUnits, eq(items.secondaryUnitId, secondaryUnits.id))
    .orderBy(desc(items.id));

  if (rows.length === 0) return rows;

  // Second query + in-memory merge rather than a join above, so the
  // one-to-many attribute values don't multiply the base item rows.
  const assignedValues = await db
    .select({ itemId: itemAttributeValues.itemId, valueName: attributeValues.name })
    .from(itemAttributeValues)
    .innerJoin(attributeValues, eq(itemAttributeValues.valueId, attributeValues.id))
    .where(
      inArray(
        itemAttributeValues.itemId,
        rows.map((row) => row.id)
      )
    );
  const namesByItemId = new Map();
  for (const { itemId, valueName } of assignedValues) {
    if (!namesByItemId.has(itemId)) namesByItemId.set(itemId, []);
    namesByItemId.get(itemId).push(valueName);
  }

  return rows.map((row) => ({ ...row, attributeValueNames: namesByItemId.get(row.id) ?? [] }));
}

export async function getItemDetail(companySlug, itemId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const [item] = await db
    .select()
    .from(items)
    .where(eq(items.id, Number(itemId)))
    .limit(1);
  return item ?? null;
}

// Sparse — only groups with an actual override for this item come back.
// The Item form cross-references this against the full partyGroups list
// (already loaded for the page) to render one row per group, blank where
// there's no override.
export async function getItemPartyGroupPrices(companySlug, itemId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({ partyGroupId: itemPartyGroupPrices.partyGroupId, sellingPrice: itemPartyGroupPrices.sellingPrice })
    .from(itemPartyGroupPrices)
    .where(eq(itemPartyGroupPrices.itemId, Number(itemId)));
}

// Mirrors legacy load_all_item_categories()'s item_count.
export async function listItemCategories(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({
      id: itemCategories.id,
      name: itemCategories.name,
      description: itemCategories.description,
      icon: itemCategories.icon,
      itemCount: count(items.id),
    })
    .from(itemCategories)
    .leftJoin(items, eq(items.categoryId, itemCategories.id))
    .groupBy(itemCategories.id)
    .orderBy(asc(itemCategories.name));
}

export async function listWarehouses(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select()
    .from(warehouses)
    .orderBy(desc(warehouses.isPrimary), desc(warehouses.id));
}

export async function createItemAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  if (await itemNameExists(db, data.name)) {
    return { ok: false, fieldErrors: { name: ["itemNameExists"] } };
  }

  const [{ id: itemId }] = await db
    .insert(items)
    .values({
      name: data.name,
      categoryId: data.categoryId || null,
      barcodeInput: data.barcodeInput ? 1 : 0,
      barcodeValue: data.barcodeValue || null,
      primaryUnitId: data.primaryUnitId,
      secondaryUnitId: data.secondaryUnitId || null,
      conversionFactor: data.secondaryUnitId ? data.conversionFactor : null,
      purchasePrice: data.purchasePrice.toFixed(5),
      sellingPrice: data.sellingPrice.toFixed(5),
    })
    .$returningId();

  await syncItemPartyGroupPrices(db, itemId, data.partyGroupPrices);
  await syncItemAttributeValues(db, itemId, data.attributeValueIds);

  // Matches legacy create_item(): every existing warehouse gets a
  // zero-quantity inventory row for this item at creation time (variant_id
  // = 0, "no variant") so stock screens never need to special-case "no row
  // yet" for a brand-new item.
  const allWarehouses = await db.select({ id: warehouses.id }).from(warehouses);
  if (allWarehouses.length > 0) {
    await db.insert(inventories).values(
      allWarehouses.map((warehouse) => ({
        itemId,
        variantId: 0,
        warehouseId: warehouse.id,
        unitId: data.primaryUnitId,
        quantity: "0.0000",
      }))
    );
  }
  // If attribute values were already picked at creation, immediately
  // re-sync into per-variant rows — same two-step order legacy's own
  // create_item() + sync_item_inventory_for_variants() run in.
  await syncItemInventoryForVariants(db, itemId, data.primaryUnitId, data.attributeValueIds);

  revalidatePath(`/${companySlug}/items`);
  revalidatePath(`/${companySlug}/items/inventory`);
  return { ok: true, message: "itemCreated" };
}

export async function updateItemAction(companySlug, itemId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(itemId);
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db.select({ id: items.id }).from(items).where(eq(items.id, id)).limit(1);
  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "itemNotFound" };
  }
  if (await itemNameExists(db, data.name, id)) {
    return { ok: false, fieldErrors: { name: ["itemNameExists"] } };
  }

  await db
    .update(items)
    .set({
      name: data.name,
      categoryId: data.categoryId || null,
      barcodeInput: data.barcodeInput ? 1 : 0,
      barcodeValue: data.barcodeValue || null,
      primaryUnitId: data.primaryUnitId,
      secondaryUnitId: data.secondaryUnitId || null,
      conversionFactor: data.secondaryUnitId ? data.conversionFactor : null,
      purchasePrice: data.purchasePrice.toFixed(5),
      sellingPrice: data.sellingPrice.toFixed(5),
    })
    .where(eq(items.id, id));

  await syncItemPartyGroupPrices(db, id, data.partyGroupPrices);
  await syncItemAttributeValues(db, id, data.attributeValueIds);
  await syncItemInventoryForVariants(db, id, data.primaryUnitId, data.attributeValueIds);

  revalidatePath(`/${companySlug}/items`);
  revalidatePath(`/${companySlug}/items/inventory`);
  return { ok: true, message: "itemUpdated" };
}

export async function deleteItemsAction(companySlug, itemIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const ids = (Array.isArray(itemIds) ? itemIds : [itemIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) {
    return { ok: false, formError: "itemNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  // Matches legacy delete_item(): hard delete, no "in use" guard yet — the
  // schema cascades inventories rows (ON DELETE CASCADE). Once sales/
  // purchase line items reference items, this needs a real guard.
  await db.delete(items).where(inArray(items.id, ids));

  revalidatePath(`/${companySlug}/items`);
  return { ok: true, message: "itemsDeleted", count: ids.length };
}

export async function createItemCategoryAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = itemCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  if (await categoryNameExists(db, data.name)) {
    return { ok: false, fieldErrors: { name: ["itemCategoryNameExists"] } };
  }

  const [{ id }] = await db
    .insert(itemCategories)
    .values({ name: data.name, description: data.description || null, icon: data.icon || null })
    .$returningId();

  revalidatePath(`/${companySlug}/items/categories`);
  revalidatePath(`/${companySlug}/items`);
  // id/name mirror createPartyGroupAction's shape — lets the Items form's
  // CreatableSelect select the freshly created category immediately instead
  // of only refreshing the underlying list (see parties/actions.js).
  return { ok: true, message: "itemCategoryCreated", id, name: data.name };
}

export async function updateItemCategoryAction(companySlug, categoryId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = itemCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(categoryId);
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  if (await categoryNameExists(db, data.name, id)) {
    return { ok: false, fieldErrors: { name: ["itemCategoryNameExists"] } };
  }

  await db
    .update(itemCategories)
    .set({ name: data.name, description: data.description || null, icon: data.icon || null })
    .where(eq(itemCategories.id, id));

  revalidatePath(`/${companySlug}/items/categories`);
  return { ok: true, message: "itemCategoryUpdated" };
}

export async function deleteItemCategoriesAction(companySlug, categoryIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const ids = (Array.isArray(categoryIds) ? categoryIds : [categoryIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) {
    return { ok: false, formError: "itemCategoryNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  // Matches legacy delete_item_category(): items keep their row,
  // category_id just falls back to NULL (schema FK is ON DELETE SET NULL).
  await db.delete(itemCategories).where(inArray(itemCategories.id, ids));

  revalidatePath(`/${companySlug}/items/categories`);
  return { ok: true, message: "itemCategoriesDeleted", count: ids.length };
}

export async function createWarehouseAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = warehouseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const { nameTaken, phoneTaken } = await warehouseNameOrPhoneExists(db, data.name, data.phoneNumber);
  if (nameTaken) return { ok: false, fieldErrors: { name: ["warehouseNameExists"] } };
  if (phoneTaken) return { ok: false, fieldErrors: { phoneNumber: ["warehousePhoneExists"] } };

  // Only one warehouse can be primary — matches legacy create_warehouse().
  if (data.isPrimary) {
    await db.update(warehouses).set({ isPrimary: 0 }).where(eq(warehouses.isPrimary, 1));
  }

  await db.insert(warehouses).values({
    name: data.name,
    type: data.type,
    phoneNumber: data.phoneNumber,
    storeAddress: data.storeAddress || null,
    isPrimary: data.isPrimary ? 1 : 0,
    invoicePrefix: normalizeInvoicePrefix(data.invoicePrefix),
  });

  revalidatePath(`/${companySlug}/items/warehouses`);
  return { ok: true, message: "warehouseCreated" };
}

export async function updateWarehouseAction(companySlug, warehouseId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = warehouseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(warehouseId);
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.id, id)).limit(1);
  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "warehouseNotFound" };
  }

  const { nameTaken, phoneTaken } = await warehouseNameOrPhoneExists(db, data.name, data.phoneNumber, id);
  if (nameTaken) return { ok: false, fieldErrors: { name: ["warehouseNameExists"] } };
  if (phoneTaken) return { ok: false, fieldErrors: { phoneNumber: ["warehousePhoneExists"] } };

  if (data.isPrimary) {
    await db.update(warehouses).set({ isPrimary: 0 }).where(ne(warehouses.id, id));
  }

  await db
    .update(warehouses)
    .set({
      name: data.name,
      type: data.type,
      phoneNumber: data.phoneNumber,
      storeAddress: data.storeAddress || null,
      isPrimary: data.isPrimary ? 1 : 0,
      invoicePrefix: normalizeInvoicePrefix(data.invoicePrefix),
    })
    .where(eq(warehouses.id, id));

  revalidatePath(`/${companySlug}/items/warehouses`);
  return { ok: true, message: "warehouseUpdated" };
}

export async function deleteWarehousesAction(companySlug, warehouseIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const ids = (Array.isArray(warehouseIds) ? warehouseIds : [warehouseIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) {
    return { ok: false, formError: "warehouseNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  await db.delete(warehouses).where(inArray(warehouses.id, ids));

  revalidatePath(`/${companySlug}/items/warehouses`);
  return { ok: true, message: "warehousesDeleted", count: ids.length };
}
