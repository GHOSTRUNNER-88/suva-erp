"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { organizations } from "@/db/schema/company";
import { settings } from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { createSession } from "@/lib/auth/session";
import { getCompanyDb, getOrganizationDb } from "@/lib/db";
import { organizationSchema } from "@/lib/organization/schema";
import { translateToNepali } from "@/lib/translate-text";

/**
 * One-time completion of the Company's default (main) Organization — the
 * bare stub createCompanyWithOwner() creates at signup (name + PAN only)
 * never got accountingStartDate/industry/features, and those can't be
 * edited later via Settings (see organizations/actions.js's
 * organizationUpdateSchema) — so this must run before the account is truly
 * usable, see proxy.js's needsOrganizationSetup gate.
 *
 * Deliberately refuses to run again once accountingStartDate is already
 * set — this is a completion step, not a general edit endpoint; editing
 * afterwards goes through the normal (narrower) Settings flow.
 */
export async function completeDefaultOrganizationAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!["owner", "admin"].includes(context.session.role)) {
    return { ok: false, fieldErrors: {}, formError: "orgNotAllowed" };
  }

  const companyDb = getCompanyDb(context.session.companyDbName);
  const [defaultOrganization] = await companyDb
    .select({
      id: organizations.id,
      organizationDbName: organizations.organizationDbName,
      accountingStartDate: organizations.accountingStartDate,
    })
    .from(organizations)
    .where(eq(organizations.isDefault, 1))
    .limit(1);

  if (!defaultOrganization) {
    return { ok: false, fieldErrors: {}, formError: "orgNotFound" };
  }
  if (defaultOrganization.accountingStartDate) {
    return { ok: false, fieldErrors: {}, formError: "organizationAlreadySetUp" };
  }

  const parsed = organizationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const [nameNe, addressNe] = await Promise.all([
    translateToNepali(data.name),
    translateToNepali(data.address),
  ]);

  await companyDb
    .update(organizations)
    .set({
      name: data.name,
      nameNe,
      industry: data.industry,
      address: data.address,
      addressNe,
      accountingStartDate: data.accountingStartDate,
      isVatRegistered: data.isVatRegistered ? 1 : 0,
      email: data.email || null,
      phoneNumber: data.phoneNumber || null,
      panNumber: data.panNumber || null,
      website: data.website || null,
      logoUrl: data.logoUrl || null,
      enabledFeatures: JSON.stringify(data.features),
    })
    .where(eq(organizations.id, defaultOrganization.id));

  // Mirrors createOrganizationAction/updateOrganizationAction — keep the
  // Organization DB's own settings row in sync, everything inside that
  // organization reads from there, not the Company DB's organizations row.
  const organizationDb = getOrganizationDb(defaultOrganization.organizationDbName);
  await organizationDb
    .update(settings)
    .set({
      organizationName: data.name,
      address: data.address,
      phone: data.phoneNumber || null,
      email: data.email || null,
      panNumber: data.panNumber || null,
      fiscalYearStart: data.accountingStartDate,
      defaultVatEnabled: data.isVatRegistered ? 1 : 0,
    });

  await createSession({ ...context.session, needsOrganizationSetup: false });

  redirect(`/${companySlug}/account/dashboard`);
}
