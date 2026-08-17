import crypto from "crypto";
import { eq } from "drizzle-orm";
import { getMasterDb, getCompanyDb, getOrganizationDb } from "@/lib/db";
import { companies, companyMembers } from "@/db/schema/master";
import { users, organizations, organizationUsers } from "@/db/schema/company";
import { settings } from "@/db/schema/organization";
import {
  provisionCompanyDatabase,
  provisionOrganizationDatabase,
  buildDatabaseName,
} from "@/lib/db/provision";
import { DEFAULT_MODULE_KEYS } from "@/lib/modules";

const RESERVED_SLUGS = new Set([
  "signup",
  "login",
  "logout",
  "license",
  "admin",
  "api",
  "www",
]);

export async function slugIsAvailable(slug) {
  if (!slug || RESERVED_SLUGS.has(slug)) {
    return false;
  }
  const masterDb = getMasterDb();
  const existing = await masterDb
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1);
  return existing.length === 0;
}

export async function panIsAvailable(panNumber) {
  if (!panNumber || !/^\d{9}$/.test(panNumber)) {
    return false;
  }
  const masterDb = getMasterDb();
  const existing = await masterDb
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.panNumber, panNumber))
    .limit(1);
  return existing.length === 0;
}

export async function firebaseUidIsAvailable(firebaseUid) {
  if (!firebaseUid) {
    return false;
  }
  const masterDb = getMasterDb();
  const existing = await masterDb
    .select({ id: companyMembers.id })
    .from(companyMembers)
    .where(eq(companyMembers.firebaseUid, firebaseUid))
    .limit(1);
  return existing.length === 0;
}

/**
 * The whole signup flow: reserves the Company's slug, provisions its
 * Company database and first Organization database, then creates the
 * Organization row and the owner user inside the Company database.
 *
 * The slug (and therefore the master `companies` row) is reserved FIRST,
 * via the table's UNIQUE constraint — so a race on slugIsAvailable() still
 * fails safely at the INSERT. If a later step fails, the master row is
 * left in `status: "trial"` pointing at a possibly-incomplete Company/
 * Organization database; there's no cross-database transaction across
 * three physical databases, same tradeoff the legacy app has. Cleaning up
 * a partial signup is a manual/ops concern for now, not handled here.
 *
 * `firebaseUid`/`email` come from an already-verified Firebase ID token
 * (see app/signup/actions.js) — this function trusts them, it does not
 * re-verify identity.
 */
export async function createCompanyWithOwner({
  companyName,
  slug,
  panNumber,
  ownerFirstName,
  ownerLastName,
  email,
  firebaseUid,
}) {
  const firebaseUidAvailable = await firebaseUidIsAvailable(firebaseUid);
  if (!firebaseUidAvailable) {
    const error = new Error("This account already has a Suva ERP company.");
    error.code = "ACCOUNT_ALREADY_REGISTERED";
    throw error;
  }

  const available = await slugIsAvailable(slug);
  if (!available) {
    const error = new Error("This URL is already taken.");
    error.code = "SLUG_TAKEN";
    throw error;
  }

  const panAvailable = await panIsAvailable(panNumber);
  if (!panAvailable) {
    const error = new Error("This PAN number is already registered.");
    error.code = "PAN_TAKEN";
    throw error;
  }

  const companyDbName = buildDatabaseName("co", slug, crypto.randomBytes(4).toString("hex"));
  const organizationDbName = buildDatabaseName(
    "org",
    companyName,
    crypto.randomBytes(4).toString("hex")
  );

  const masterDb = getMasterDb();
  const [{ id: companyId }] = await masterDb
    .insert(companies)
    .values({
      name: companyName,
      slug,
      panNumber,
      companyDbName,
      status: "trial",
      purchasedModules: JSON.stringify(DEFAULT_MODULE_KEYS),
    })
    .$returningId();

  await provisionCompanyDatabase(companyDbName);
  await provisionOrganizationDatabase(organizationDbName);

  // Every later module (VAT, invoicing, dashboards) assumes a settings row
  // already exists — seed it now rather than making each of them guard
  // for "no row yet" (mirrors the legacy app's same guarantee).
  const organizationDb = getOrganizationDb(organizationDbName);
  await organizationDb.insert(settings).values({
    organizationName: companyName,
    panNumber,
  });

  const companyDb = getCompanyDb(companyDbName);

  const [{ id: organizationId }] = await companyDb
    .insert(organizations)
    .values({
      name: companyName,
      panNumber,
      organizationDbName,
      isDefault: 1,
      enabledModules: JSON.stringify(DEFAULT_MODULE_KEYS),
    })
    .$returningId();

  const [{ id: userId }] = await companyDb
    .insert(users)
    .values({
      firstName: ownerFirstName,
      lastName: ownerLastName || null,
      email,
      firebaseUid,
      role: "owner",
      lastOrganizationId: organizationId,
    })
    .$returningId();

  await companyDb.insert(organizationUsers).values({
    organizationId,
    userId,
    role: "owner",
    status: "active",
  });

  // The only way a future login (by Firebase uid) can find this Company.
  await masterDb.insert(companyMembers).values({
    firebaseUid,
    companyId,
    companyUserId: userId,
  });

  return {
    companyId,
    companySlug: slug,
    companyDbName,
    organizationId,
    organizationDbName,
    userId,
    role: "owner",
  };
}
