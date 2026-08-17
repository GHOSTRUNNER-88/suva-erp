"use server";

import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { parties, partyGroups } from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { z } from "zod";

/**
 * Trimmed down from legacy models/Party.php's full field set at the user's
 * explicit request — just enough to identify and reach a party, plus
 * opening balance (re-added for the party ledger view). See
 * ../../../db/schema/organization.js for what was deliberately dropped
 * (and why) and what stays renamed ("party level" -> "party group").
 */
// Empty-string/undefined/null all normalize to null for an optional foreign
// key select (CreatableSelect's "not selected" state is ""), then a real id
// still has to be a positive integer. Plain `z.coerce.number()...nullable()`
// does NOT do this safely: z.coerce.number() coerces "" to 0 before
// `.nullable()` ever gets a chance to see the empty string, and 0 then fails
// `.positive()` — verified against this project's installed zod (v4).
const optionalId = () =>
  z.preprocess((value) => (value === "" || value == null ? null : value), z.coerce.number().int().positive().nullable());

const partySchema = z.object({
  name: z.string().trim().min(1, "partyNameRequired").max(225, "partyNameTooLong"),
  type: z.enum(["Customer", "Supplier", "Both"]).default("Customer"),
  phoneNumber: z.string().trim().max(20, "phoneTooLong").optional().or(z.literal("")),
  address: z.string().trim().max(2000).optional().or(z.literal("")),
  panNumber: z.string().trim().max(50).optional().or(z.literal("")),
  partyGroupId: optionalId(),
  openingBalance: z.coerce.number().min(0, "somethingWentWrong").default(0),
  openingBalanceType: z.enum(["Dr", "Cr"]).default("Dr"),
});

const partyGroupSchema = z.object({
  name: z.string().trim().min(1, "partyGroupNameRequired").max(150, "partyGroupNameTooLong"),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
});

function canAccessParties(context) {
  return context.accessibleModules.includes("parties");
}

async function partyNameExists(db, name, exceptId) {
  const where = exceptId ? and(eq(parties.name, name), ne(parties.id, exceptId)) : eq(parties.name, name);
  const existing = await db.select({ id: parties.id }).from(parties).where(where).limit(1);
  return existing.length > 0;
}

async function partyGroupNameExists(db, name, exceptId) {
  const where = exceptId
    ? and(eq(partyGroups.name, name), ne(partyGroups.id, exceptId))
    : eq(partyGroups.name, name);
  const existing = await db.select({ id: partyGroups.id }).from(partyGroups).where(where).limit(1);
  return existing.length > 0;
}

export async function listParties(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessParties(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({
      id: parties.id,
      name: parties.name,
      type: parties.type,
      phoneNumber: parties.phoneNumber,
      address: parties.address,
      panNumber: parties.panNumber,
      partyGroupId: parties.partyGroupId,
      partyGroupName: partyGroups.name,
      balance: parties.balance,
      createdAt: parties.createdAt,
    })
    .from(parties)
    .leftJoin(partyGroups, eq(parties.partyGroupId, partyGroups.id))
    .orderBy(asc(parties.name));
}

// Parties belonging to one group — powers the group-detail split view
// (Party Groups -> parties in that group -> selected party's ledger).
export async function listPartiesByGroup(companySlug, groupId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessParties(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({
      id: parties.id,
      name: parties.name,
      type: parties.type,
      phoneNumber: parties.phoneNumber,
      balance: parties.balance,
    })
    .from(parties)
    .where(eq(parties.partyGroupId, Number(groupId)))
    .orderBy(asc(parties.name));
}

export async function getPartyDetail(companySlug, partyId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessParties(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const [party] = await db
    .select()
    .from(parties)
    .where(eq(parties.id, Number(partyId)))
    .limit(1);
  return party ?? null;
}

/**
 * Party header + its ledger — mirrors legacy build_party_ledger() (see
 * models/Party.php §"Builds the full party ledger for a period"): the
 * opening balance as the first entry, then every ledger transaction
 * (sales, purchases, payments, credit/debit notes, expenses) in
 * chronological order with a running balance. No ledger-writing module
 * exists yet in this port (sales/purchase/payments), so the entries array
 * is just the opening balance line for now — real transaction rows get
 * appended here once those modules land, not recomputed ad hoc elsewhere.
 */
export async function getPartyLedger(companySlug, partyId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessParties(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const [party] = await db
    .select({
      id: parties.id,
      name: parties.name,
      type: parties.type,
      phoneNumber: parties.phoneNumber,
      address: parties.address,
      panNumber: parties.panNumber,
      partyGroupId: parties.partyGroupId,
      partyGroupName: partyGroups.name,
      openingBalance: parties.openingBalance,
      openingBalanceType: parties.openingBalanceType,
      balance: parties.balance,
      createdAt: parties.createdAt,
    })
    .from(parties)
    .leftJoin(partyGroups, eq(parties.partyGroupId, partyGroups.id))
    .where(eq(parties.id, Number(partyId)))
    .limit(1);

  if (!party) return null;

  const openingSigned = signedBalance(Number(party.openingBalance), party.openingBalanceType);
  const entries = [
    {
      key: "opening",
      date: party.createdAt,
      label: "openingBalance",
      debit: openingSigned > 0 ? Math.abs(openingSigned) : 0,
      credit: openingSigned < 0 ? Math.abs(openingSigned) : 0,
      runningBalance: openingSigned,
    },
  ];

  return { party, entries };
}

// Mirrors legacy load_all_party_levels()'s party_count (LEFT JOIN + GROUP
// BY) — used to warn before deleting a group that's actually assigned.
export async function listPartyGroups(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessParties(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({
      id: partyGroups.id,
      name: partyGroups.name,
      description: partyGroups.description,
      partyCount: count(parties.id),
    })
    .from(partyGroups)
    .leftJoin(parties, eq(parties.partyGroupId, partyGroups.id))
    .groupBy(partyGroups.id)
    .orderBy(asc(partyGroups.name));
}

export async function getPartyGroupDetail(companySlug, groupId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessParties(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const [group] = await db
    .select({ id: partyGroups.id, name: partyGroups.name, description: partyGroups.description })
    .from(partyGroups)
    .where(eq(partyGroups.id, Number(groupId)))
    .limit(1);
  return group ?? null;
}

// Signed running balance: positive = Dr (they owe us), negative = Cr (we
// owe them) — see ../../../db/schema/organization.js and
// ../../../../AGENTS.md §6. No ledger-writing modules exist yet (sales,
// purchase, payments), so for now this always equals the signed opening
// balance — once those land, this must be replaced by the same
// from-scratch recalculation legacy's recalculate_party_balance() does
// (walk every ledger entry, don't accumulate deltas ad hoc).
function signedBalance(openingBalance, openingBalanceType) {
  return openingBalanceType === "Cr" ? -Math.abs(openingBalance) : Math.abs(openingBalance);
}

function partyValues(data) {
  return {
    name: data.name,
    type: data.type,
    phoneNumber: data.phoneNumber || null,
    address: data.address || null,
    panNumber: data.panNumber || null,
    partyGroupId: data.partyGroupId || null,
    openingBalance: data.openingBalance.toFixed(2),
    openingBalanceType: data.openingBalanceType,
    balance: signedBalance(data.openingBalance, data.openingBalanceType).toFixed(2),
  };
}

export async function createPartyAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessParties(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = partySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  if (await partyNameExists(db, data.name)) {
    return { ok: false, fieldErrors: { name: ["partyNameExists"] } };
  }

  await db.insert(parties).values(partyValues(data));

  revalidatePath(`/${companySlug}/parties`);
  return { ok: true, message: "partyCreated" };
}

export async function updatePartyAction(companySlug, partyId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessParties(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = partySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(partyId);
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db.select({ id: parties.id }).from(parties).where(eq(parties.id, id)).limit(1);
  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "partyNotFound" };
  }
  if (await partyNameExists(db, data.name, id)) {
    return { ok: false, fieldErrors: { name: ["partyNameExists"] } };
  }

  await db.update(parties).set(partyValues(data)).where(eq(parties.id, id));

  revalidatePath(`/${companySlug}/parties`);
  return { ok: true, message: "partyUpdated" };
}

export async function deletePartiesAction(companySlug, partyIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessParties(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const ids = (Array.isArray(partyIds) ? partyIds : [partyIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) {
    return { ok: false, formError: "partyNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  // Matches legacy delete_party(): hard delete, no referential guard —
  // once sales/purchase/payment tables reference parties, this needs a
  // real "in use" guard.
  await db.delete(parties).where(inArray(parties.id, ids));

  revalidatePath(`/${companySlug}/parties`);
  return { ok: true, message: "partiesDeleted", count: ids.length };
}

export async function createPartyGroupAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessParties(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = partyGroupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  if (await partyGroupNameExists(db, data.name)) {
    return { ok: false, fieldErrors: { name: ["partyGroupNameExists"] } };
  }

  const [{ id }] = await db
    .insert(partyGroups)
    .values({ name: data.name, description: data.description || null })
    .$returningId();

  revalidatePath(`/${companySlug}/parties/groups`);
  revalidatePath(`/${companySlug}/parties`);
  return { ok: true, message: "partyGroupCreated", id, name: data.name };
}

export async function updatePartyGroupAction(companySlug, groupId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessParties(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = partyGroupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(groupId);
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  if (await partyGroupNameExists(db, data.name, id)) {
    return { ok: false, fieldErrors: { name: ["partyGroupNameExists"] } };
  }

  await db
    .update(partyGroups)
    .set({ name: data.name, description: data.description || null })
    .where(eq(partyGroups.id, id));

  revalidatePath(`/${companySlug}/parties/groups`);
  return { ok: true, message: "partyGroupUpdated" };
}

export async function deletePartyGroupsAction(companySlug, groupIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessParties(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const ids = (Array.isArray(groupIds) ? groupIds : [groupIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) {
    return { ok: false, formError: "partyGroupNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  // Matches legacy delete_party_level(): parties keep their row,
  // party_group_id just falls back to NULL (schema FK is ON DELETE SET NULL).
  await db.delete(partyGroups).where(inArray(partyGroups.id, ids));

  revalidatePath(`/${companySlug}/parties/groups`);
  return { ok: true, message: "partyGroupsDeleted", count: ids.length };
}
