"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { companyMembers, companies } from "@/db/schema/master";
import { organizations, users } from "@/db/schema/company";
import { createSession } from "@/lib/auth/session";
import { getCompanyDb, getMasterDb } from "@/lib/db";
import { getAdminAuth } from "@/lib/firebase/admin";

export async function loginAction({ idToken, companySlug } = {}) {
  if (!idToken) {
    return {
      ok: false,
      formError: "signInIncomplete",
    };
  }

  let decodedToken;
  try {
    decodedToken = await getAdminAuth().verifyIdToken(idToken);
  } catch (error) {
    console.error("[login] invalid Firebase ID token", error);
    return {
      ok: false,
      formError: "sessionExpired",
    };
  }

  const masterDb = getMasterDb();
  const [membership] = await masterDb
    .select({
      companyId: companies.id,
      companySlug: companies.slug,
      companyDbName: companies.companyDbName,
      companyStatus: companies.status,
      companyUserId: companyMembers.companyUserId,
    })
    .from(companyMembers)
    .innerJoin(companies, eq(companyMembers.companyId, companies.id))
    .where(eq(companyMembers.firebaseUid, decodedToken.uid))
    .limit(1);

  if (!membership) {
    return {
      ok: false,
      formError: "noCompanyForAccount",
    };
  }

  if (companySlug && membership.companySlug !== companySlug) {
    return {
      ok: false,
      formError: "accountWrongCompany",
    };
  }

  if (["suspended", "cancelled"].includes(membership.companyStatus)) {
    return {
      ok: false,
      formError: "companyNotActive",
    };
  }

  const companyDb = getCompanyDb(membership.companyDbName);
  const [user] = await companyDb
    .select()
    .from(users)
    .where(eq(users.id, membership.companyUserId))
    .limit(1);

  if (!user || !user.isActive) {
    return {
      ok: false,
      formError: "userNotActive",
    };
  }

  const organizationRows = await companyDb
    .select()
    .from(organizations)
    .where(eq(organizations.isDefault, 1))
    .limit(1);
  const [fallbackOrganization] = organizationRows.length
    ? organizationRows
    : await companyDb.select().from(organizations).limit(1);

  const organizationId = user.lastOrganizationId ?? fallbackOrganization?.id;
  const organizationDbName =
    fallbackOrganization?.id === organizationId
      ? fallbackOrganization.organizationDbName
      : (
          await companyDb
            .select()
            .from(organizations)
            .where(eq(organizations.id, organizationId))
            .limit(1)
        )[0]?.organizationDbName;

  if (!organizationId || !organizationDbName) {
    return {
      ok: false,
      formError: "noOrganizationConfigured",
    };
  }

  // organizationRows (when non-empty) is the isDefault=1 row — the setup
  // wizard is mandatory until it has a accountingStartDate, see
  // app/[company]/setup and proxy.js.
  const [defaultOrganizationRow] = organizationRows;
  const needsOrganizationSetup = Boolean(defaultOrganizationRow && !defaultOrganizationRow.accountingStartDate);

  await createSession({
    userId: user.id,
    role: user.role,
    companyId: membership.companyId,
    companySlug: membership.companySlug,
    companyDbName: membership.companyDbName,
    organizationId,
    organizationDbName,
    needsOrganizationSetup,
  });

  if (needsOrganizationSetup) {
    redirect(`/${membership.companySlug}/setup`);
  }

  // Only owner/admin manage the company itself (Organizations, Module
  // Store, Company Settings) — everyone else lands straight in the ERP for
  // their organization, which is the only area they can actually reach
  // (see proxy.js, which blocks /account/* for non-admins).
  const landingPath = ["owner", "admin"].includes(user.role) ? "account/dashboard" : "dashboard";
  redirect(`/${membership.companySlug}/${landingPath}`);
}
