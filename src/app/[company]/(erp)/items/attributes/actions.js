"use server";

import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { attributes, attributeValues, itemAttributeValues } from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { z } from "zod";

/**
 * Ported from legacy models/Attribute.php + admin/api/attributes/index.php
 * (APP-REPORT.md §7.3) — see db/schema/organization.js's block comment for
 * what's deliberately not ported (item_variant_map, full variant
 * combinations, per-variant inventory).
 */
const attributeSchema = z.object({
  name: z.string().trim().min(1, "attributeNameRequired").max(50, "attributeNameTooLong"),
});

const attributeValueSchema = z.object({
  attrId: z.coerce.number().int().positive("attributeRequired"),
  name: z.string().trim().min(1, "attributeValueNameRequired").max(50, "attributeValueNameTooLong"),
});

function canAccessItems(context) {
  return context.accessibleModules.includes("items");
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

// legacy's UI auto-generates the slug from the name (checked-by-default
// "Auto generate slug" toggle) — this always auto-generates, with a
// numeric suffix on collision, since there's no visible slug field to let
// a person resolve the collision themselves the way legacy's manual
// override could.
async function uniqueSlug(base, exists) {
  const root = slugify(base) || "item";
  let candidate = root;
  let suffix = 2;
  while (await exists(candidate)) {
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function attributeNameExists(db, name, exceptId) {
  const where = exceptId ? and(eq(attributes.name, name), ne(attributes.id, exceptId)) : eq(attributes.name, name);
  const existing = await db.select({ id: attributes.id }).from(attributes).where(where).limit(1);
  return existing.length > 0;
}

async function attributeSlugExists(db, slug, exceptId) {
  const where = exceptId ? and(eq(attributes.slug, slug), ne(attributes.id, exceptId)) : eq(attributes.slug, slug);
  const existing = await db.select({ id: attributes.id }).from(attributes).where(where).limit(1);
  return existing.length > 0;
}

async function attributeValueNameExists(db, attrId, name, exceptId) {
  const base = and(eq(attributeValues.attrId, attrId), eq(attributeValues.name, name));
  const where = exceptId ? and(base, ne(attributeValues.id, exceptId)) : base;
  const existing = await db.select({ id: attributeValues.id }).from(attributeValues).where(where).limit(1);
  return existing.length > 0;
}

async function attributeValueSlugExists(db, attrId, slug, exceptId) {
  const base = and(eq(attributeValues.attrId, attrId), eq(attributeValues.slug, slug));
  const where = exceptId ? and(base, ne(attributeValues.id, exceptId)) : base;
  const existing = await db.select({ id: attributeValues.id }).from(attributeValues).where(where).limit(1);
  return existing.length > 0;
}

export async function listAttributes(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({
      id: attributes.id,
      name: attributes.name,
      valueCount: count(attributeValues.id),
    })
    .from(attributes)
    .leftJoin(attributeValues, eq(attributeValues.attrId, attributes.id))
    .groupBy(attributes.id)
    .orderBy(asc(attributes.name));
}

export async function getAttributeDetail(companySlug, attrId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const [attribute] = await db
    .select({ id: attributes.id, name: attributes.name })
    .from(attributes)
    .where(eq(attributes.id, Number(attrId)))
    .limit(1);
  return attribute ?? null;
}

export async function listAttributeValues(companySlug, attrId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({ id: attributeValues.id, attrId: attributeValues.attrId, name: attributeValues.name })
    .from(attributeValues)
    .where(eq(attributeValues.attrId, Number(attrId)))
    .orderBy(asc(attributeValues.name));
}

// All attributes with their values nested — for the Item form's "which
// values apply to this item" picker (one group per attribute).
export async function listAttributesWithValues(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  const rows = await db
    .select({
      attrId: attributes.id,
      attrName: attributes.name,
      valueId: attributeValues.id,
      valueName: attributeValues.name,
    })
    .from(attributes)
    .leftJoin(attributeValues, eq(attributeValues.attrId, attributes.id))
    .orderBy(asc(attributes.name), asc(attributeValues.name));

  const byAttr = new Map();
  for (const row of rows) {
    if (!byAttr.has(row.attrId)) {
      byAttr.set(row.attrId, { id: row.attrId, name: row.attrName, values: [] });
    }
    if (row.valueId) {
      byAttr.get(row.attrId).values.push({ id: row.valueId, name: row.valueName });
    }
  }
  return [...byAttr.values()];
}

export async function getItemAttributeValueIds(companySlug, itemId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  const rows = await db
    .select({ valueId: itemAttributeValues.valueId })
    .from(itemAttributeValues)
    .where(eq(itemAttributeValues.itemId, Number(itemId)));
  return rows.map((row) => row.valueId);
}

// Full-replace sync — same pattern as legacy's sync_item_variants (clear,
// then re-insert the given set) and this app's own
// syncItemPartyGroupPrices (see items/actions.js).
export async function setItemAttributeValuesAction(companySlug, itemId, valueIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, formError: "notAllowed" };
  }
  const id = Number(itemId);
  const ids = (Array.isArray(valueIds) ? valueIds : []).map(Number).filter(Number.isInteger);
  const db = getOrganizationDb(context.session.organizationDbName);

  await db.delete(itemAttributeValues).where(eq(itemAttributeValues.itemId, id));
  if (ids.length > 0) {
    await db.insert(itemAttributeValues).values(ids.map((valueId) => ({ itemId: id, valueId })));
  }

  revalidatePath(`/${companySlug}/items`);
  return { ok: true };
}

export async function createAttributeAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = attributeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  if (await attributeNameExists(db, data.name)) {
    return { ok: false, fieldErrors: { name: ["attributeNameExists"] } };
  }

  const slug = await uniqueSlug(data.name, (candidate) => attributeSlugExists(db, candidate));

  const [{ id }] = await db.insert(attributes).values({ name: data.name, slug }).$returningId();

  revalidatePath(`/${companySlug}/items/attributes`);
  return { ok: true, message: "attributeCreated", id, name: data.name };
}

export async function updateAttributeAction(companySlug, attrId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = attributeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(attrId);
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db.select({ id: attributes.id }).from(attributes).where(eq(attributes.id, id)).limit(1);
  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "attributeNotFound" };
  }
  if (await attributeNameExists(db, data.name, id)) {
    return { ok: false, fieldErrors: { name: ["attributeNameExists"] } };
  }

  const slug = await uniqueSlug(data.name, (candidate) => attributeSlugExists(db, candidate, id));

  await db.update(attributes).set({ name: data.name, slug }).where(eq(attributes.id, id));

  revalidatePath(`/${companySlug}/items/attributes`);
  return { ok: true, message: "attributeUpdated" };
}

export async function deleteAttributesAction(companySlug, attrIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const ids = (Array.isArray(attrIds) ? attrIds : [attrIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) {
    return { ok: false, formError: "attributeNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  // Cascades attribute_values -> item_attribute_values (schema FKs), same
  // as legacy's attributes -> product_variants -> item_variants cascade.
  await db.delete(attributes).where(inArray(attributes.id, ids));

  revalidatePath(`/${companySlug}/items/attributes`);
  revalidatePath(`/${companySlug}/items`);
  return { ok: true, message: "attributesDeleted", count: ids.length };
}

export async function createAttributeValueAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = attributeValueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [attribute] = await db
    .select({ id: attributes.id })
    .from(attributes)
    .where(eq(attributes.id, data.attrId))
    .limit(1);
  if (!attribute) {
    return { ok: false, fieldErrors: {}, formError: "attributeNotFound" };
  }
  if (await attributeValueNameExists(db, data.attrId, data.name)) {
    return { ok: false, fieldErrors: { name: ["attributeValueNameExists"] } };
  }

  const slug = await uniqueSlug(data.name, (candidate) => attributeValueSlugExists(db, data.attrId, candidate));

  const [{ id }] = await db
    .insert(attributeValues)
    .values({ attrId: data.attrId, name: data.name, slug })
    .$returningId();

  revalidatePath(`/${companySlug}/items/attributes`);
  revalidatePath(`/${companySlug}/items/attributes/${data.attrId}`);
  return { ok: true, message: "attributeValueCreated", id, name: data.name };
}

export async function updateAttributeValueAction(companySlug, valueId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = attributeValueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(valueId);
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db
    .select({ id: attributeValues.id })
    .from(attributeValues)
    .where(eq(attributeValues.id, id))
    .limit(1);
  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "attributeValueNotFound" };
  }
  if (await attributeValueNameExists(db, data.attrId, data.name, id)) {
    return { ok: false, fieldErrors: { name: ["attributeValueNameExists"] } };
  }

  const slug = await uniqueSlug(data.name, (candidate) => attributeValueSlugExists(db, data.attrId, candidate, id));

  await db.update(attributeValues).set({ name: data.name, slug }).where(eq(attributeValues.id, id));

  revalidatePath(`/${companySlug}/items/attributes`);
  revalidatePath(`/${companySlug}/items/attributes/${data.attrId}`);
  return { ok: true, message: "attributeValueUpdated" };
}

export async function deleteAttributeValuesAction(companySlug, valueIds, attrId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessItems(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const ids = (Array.isArray(valueIds) ? valueIds : [valueIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) {
    return { ok: false, formError: "attributeValueNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  await db.delete(attributeValues).where(inArray(attributeValues.id, ids));

  revalidatePath(`/${companySlug}/items/attributes`);
  if (attrId) revalidatePath(`/${companySlug}/items/attributes/${attrId}`);
  revalidatePath(`/${companySlug}/items`);
  return { ok: true, message: "attributeValuesDeleted", count: ids.length };
}
