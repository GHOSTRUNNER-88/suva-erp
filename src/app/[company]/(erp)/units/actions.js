"use server";

import { and, asc, desc, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { units } from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { z } from "zod";

const unitSchema = z.object({
  name: z.string().trim().min(1, "unitNameRequired").max(50, "unitNameTooLong"),
  code: z.string().trim().min(1, "unitCodeRequired").max(20, "unitCodeTooLong"),
  type: z.string().trim().max(30, "unitTypeTooLong").optional().or(z.literal("")),
});

function canAccessUnits(context) {
  return context.accessibleModules.includes("units");
}

async function unitNameExists(db, name, exceptId) {
  const where = exceptId ? and(eq(units.name, name), ne(units.id, exceptId)) : eq(units.name, name);
  const existing = await db.select({ id: units.id }).from(units).where(where).limit(1);
  return existing.length > 0;
}

async function unitCodeExists(db, code, exceptId) {
  const where = exceptId ? and(eq(units.code, code), ne(units.id, exceptId)) : eq(units.code, code);
  const existing = await db.select({ id: units.id }).from(units).where(where).limit(1);
  return existing.length > 0;
}

// Active-only — this is what every *other* module's unit picker consumes
// (see items/page.js), so it must stay filtered even now that the Units
// management page itself needs the full list (see listAllUnits below).
export async function listUnits(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessUnits(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db.select().from(units).where(eq(units.isActive, 1)).orderBy(asc(units.name));
}

// Active + inactive, for the management table — the old UI could deactivate
// a unit but had no way to see or undo that afterward (listUnits excludes
// it, and there was no reactivate action). setUnitActiveAction below fixes
// the second half of that gap.
export async function listAllUnits(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessUnits(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db.select().from(units).orderBy(desc(units.isActive), asc(units.name));
}

export async function createUnitAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessUnits(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  if (await unitNameExists(db, data.name)) {
    return { ok: false, fieldErrors: { name: ["unitNameExists"] } };
  }
  if (await unitCodeExists(db, data.code)) {
    return { ok: false, fieldErrors: { code: ["unitCodeExists"] } };
  }

  const [{ id }] = await db
    .insert(units)
    .values({ name: data.name, code: data.code, type: data.type || null, isActive: 1 })
    .$returningId();

  revalidatePath(`/${companySlug}/units`);
  revalidatePath(`/${companySlug}/items`);
  // id/name/code mirror createPartyGroupAction's shape — lets the Items
  // form's quick-add-unit flow select the freshly created unit immediately.
  return { ok: true, message: "unitCreated", id, name: data.name, code: data.code };
}

export async function updateUnitAction(companySlug, unitId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessUnits(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const id = Number(unitId);
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db.select({ id: units.id }).from(units).where(eq(units.id, id)).limit(1);
  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "unitNotFound" };
  }
  if (await unitNameExists(db, data.name, id)) {
    return { ok: false, fieldErrors: { name: ["unitNameExists"] } };
  }
  if (await unitCodeExists(db, data.code, id)) {
    return { ok: false, fieldErrors: { code: ["unitCodeExists"] } };
  }

  await db
    .update(units)
    .set({ name: data.name, code: data.code, type: data.type || null })
    .where(eq(units.id, id));

  revalidatePath(`/${companySlug}/units`);
  return { ok: true, message: "unitUpdated" };
}

export async function setUnitActiveAction(companySlug, unitId, isActive) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessUnits(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const id = Number(unitId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, formError: "unitNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  await db.update(units).set({ isActive: isActive ? 1 : 0 }).where(eq(units.id, id));

  revalidatePath(`/${companySlug}/units`);
  return { ok: true, message: isActive ? "unitActivated" : "unitDeactivated" };
}
