"use server";

import crypto from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { organizationUsers, organizations, users } from "@/db/schema/company";
import { companies, companyMembers } from "@/db/schema/master";
import { settings } from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { createSession } from "@/lib/auth/session";
import { getCompanyDb, getMasterDb, getOrganizationDb } from "@/lib/db";
import { buildDatabaseName, provisionOrganizationDatabase } from "@/lib/db/provision";
import { getAdminAuth, getAdminStorageBucket } from "@/lib/firebase/admin";
import { sendInvitePasswordResetEmail } from "@/lib/firebase/send-password-reset-email";
import { DEFAULT_MODULE_KEYS, parseModuleList } from "@/lib/modules";
import { ACCOUNTING_FEATURES, organizationSchema } from "@/lib/organization/schema";
import { translateToNepali } from "@/lib/translate-text";
import { z } from "zod";
import { seedDefaultExpenseCategories } from "@/app/[company]/(erp)/purchase/expense-categories/actions";

const newUserSchema = z.object({
  firstName: z.string().trim().min(1, "firstNameRequired").max(100, "firstNameTooLong"),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  email: z.string().trim().email("emailInvalid"),
  phoneNumber: z.string().trim().max(30, "phoneTooLong").optional().or(z.literal("")),
  // "password" mode: admin sets it now (min 8, validated below). "invite"
  // mode: this is unused — a random password nobody ever sees is generated
  // server-side instead, see addOrganizationUserAction.
  mode: z.enum(["password", "invite"]).default("password"),
  password: z.string().max(4096).optional().or(z.literal("")),
  role: z.enum(["admin", "member"]).default("member"),
  // Only meaningful when role === "member" — admins get every enabled
  // module automatically (see lib/permissions.js). Further filtered
  // server-side to the organization's actual enabledModules.
  modulePermissions: z.array(z.string()).default([]),
}).superRefine((data, ctx) => {
  if (data.mode === "password" && data.password.length < 8) {
    ctx.addIssue({ code: "custom", path: ["password"], message: "passwordTooShort" });
  }
});

const userUpdateSchema = z.object({
  firstName: z.string().trim().min(1, "firstNameRequired").max(100, "firstNameTooLong"),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  phoneNumber: z.string().trim().max(30, "phoneTooLong").optional().or(z.literal("")),
  role: z.enum(["admin", "member"]),
  modulePermissions: z.array(z.string()).default([]),
});

// Free text, not a strict enum — same reasoning as organizationSchema's
// industry field (see lib/organization/schema.js).
const industryField = z.string().trim().min(1, "industryRequired").max(120, "industryTooLong");

// Deliberately narrower than organizationSchema — accountingStartDate and
// enabled features aren't editable from Settings (fiscal start affects
// prior calculations; features get their own follow-up flow). Same field
// names/error keys as organizationSchema where they overlap, so the
// wizard's and Settings' error handling stay consistent.
const organizationUpdateSchema = z.object({
  name: z.string().trim().min(2, "organizationNameRequired").max(180, "organizationNameTooLong"),
  industry: industryField,
  address: z.string().trim().min(1, "addressRequired").max(1000, "addressTooLong"),
  isVatRegistered: z.boolean(),
  email: z.string().trim().email("emailInvalid").optional().or(z.literal("")),
  phoneNumber: z.string().trim().max(30, "phoneTooLong").optional().or(z.literal("")),
  panNumber: z.string().trim().regex(/^\d{9}$/, "panInvalid").optional().or(z.literal("")),
  website: z.string().trim().url("websiteInvalid").optional().or(z.literal("")),
  logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
});

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Uploads the file immediately (called on file-picker change, before the
 * rest of the organization form is submitted) and just hands back the
 * resulting Firebase Storage URL for the form to carry along — logos are
 * branding assets, not sensitive, so they're stored public-read rather
 * than behind signed URLs.
 */
export async function uploadOrganizationLogoAction(companySlug, formData) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!["owner", "admin"].includes(context.session.role)) {
    return { ok: false, formError: "orgNotAllowed" };
  }

  const file = formData.get("logo");
  if (!file || typeof file === "string") {
    return { ok: false, formError: "logoRequired" };
  }
  if (!file.type?.startsWith("image/")) {
    return { ok: false, formError: "logoInvalidType" };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, formError: "logoTooLarge" };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = (file.type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "");
    const objectPath = `organization-logos/${context.session.companyId}/${crypto.randomBytes(8).toString("hex")}.${extension}`;

    const bucket = getAdminStorageBucket();
    await bucket.file(objectPath).save(buffer, { metadata: { contentType: file.type }, public: true });

    return { ok: true, url: `https://storage.googleapis.com/${bucket.name}/${objectPath}` };
  } catch (error) {
    console.error("[organizations] uploadOrganizationLogoAction failed", error);
    return { ok: false, formError: "logoUploadFailed" };
  }
}


export async function listOrganizations(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  const companyDb = getCompanyDb(context.session.companyDbName);
  return companyDb.select().from(organizations).orderBy(asc(organizations.name));
}

export async function getOrganizationDetail(companySlug, organizationId) {
  const context = await getAuthenticatedAppContext(companySlug);
  const companyDb = getCompanyDb(context.session.companyDbName);
  const [organization] = await companyDb
    .select()
    .from(organizations)
    .where(eq(organizations.id, Number(organizationId)))
    .limit(1);

  if (!organization) {
    return null;
  }

  return organization;
}

/**
 * Reads the organization's own Settings row (org DB, not the company-level
 * `organizations` row) for whatever fields Settings pages need to display
 * live rather than hardcode — currently just negativeStockAction, the
 * three-way gate items/inventory/actions.js's adjustInventoryAction and
 * transferStockAction actually branch on (see db/schema/organization.js's
 * settings.negativeStockAction). Defaults to 1 ("warn") if the row is
 * somehow missing, matching getNegativeStockAction's own fallback there.
 */
export async function getOrganizationSettings(companySlug, organizationId) {
  const context = await getAuthenticatedAppContext(companySlug);
  const companyDb = getCompanyDb(context.session.companyDbName);
  const [organization] = await companyDb
    .select({ organizationDbName: organizations.organizationDbName })
    .from(organizations)
    .where(eq(organizations.id, Number(organizationId)))
    .limit(1);

  if (!organization) {
    return null;
  }

  const organizationDb = getOrganizationDb(organization.organizationDbName);
  const [settingsRow] = await organizationDb
    .select({ negativeStockAction: settings.negativeStockAction })
    .from(settings)
    .limit(1);

  return { negativeStockAction: settingsRow?.negativeStockAction ?? 1 };
}

export async function listOrganizationUsers(companySlug, organizationId) {
  const context = await getAuthenticatedAppContext(companySlug);
  const companyDb = getCompanyDb(context.session.companyDbName);
  return companyDb
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phoneNumber: users.phoneNumber,
      companyRole: users.role,
      isActive: users.isActive,
      organizationRole: organizationUsers.role,
      organizationStatus: organizationUsers.status,
      modulePermissions: organizationUsers.modulePermissions,
      joinedAt: organizationUsers.createdAt,
    })
    .from(organizationUsers)
    .innerJoin(users, eq(organizationUsers.userId, users.id))
    .where(eq(organizationUsers.organizationId, Number(organizationId)))
    .orderBy(asc(users.firstName), asc(users.email));
}

export async function getOrganizationManagementSummary(companySlug) {
  const [organizationRows, context] = await Promise.all([
    listOrganizations(companySlug),
    getAuthenticatedAppContext(companySlug),
  ]);
  const companyDb = getCompanyDb(context.session.companyDbName);
  const membershipRows = await companyDb
    .select({
      organizationId: organizationUsers.organizationId,
      status: organizationUsers.status,
      userId: organizationUsers.userId,
    })
    .from(organizationUsers);

  const usersByOrganization = new Map();
  for (const membership of membershipRows) {
    const current = usersByOrganization.get(membership.organizationId) ?? {
      total: 0,
      active: 0,
      invited: 0,
      disabled: 0,
    };
    current.total += 1;
    current[membership.status] = (current[membership.status] ?? 0) + 1;
    usersByOrganization.set(membership.organizationId, current);
  }

  return {
    context,
    organizations: organizationRows.map((organization) => ({
      ...organization,
      userSummary: usersByOrganization.get(organization.id) ?? {
        total: 0,
        active: 0,
        invited: 0,
        disabled: 0,
      },
    })),
  };
}

export async function createOrganizationAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!["owner", "admin"].includes(context.session.role)) {
    return { ok: false, fieldErrors: {}, formError: "orgNotAllowed" };
  }

  const parsed = organizationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const companyDb = getCompanyDb(context.session.companyDbName);
  const organizationDbName = buildDatabaseName(
    "org",
    data.name,
    crypto.randomBytes(4).toString("hex")
  );

  await provisionOrganizationDatabase(organizationDbName);

  // Machine-translated once here, not on every page read — see
  // lib/translate-text.js. Only name/address carry real language content;
  // PAN/email/phone/website are identifiers, not translated.
  const masterDb = getMasterDb();
  const [nameNe, addressNe, [company]] = await Promise.all([
    translateToNepali(data.name),
    translateToNepali(data.address),
    masterDb
      .select({ purchasedModules: companies.purchasedModules })
      .from(companies)
      .where(eq(companies.id, context.session.companyId))
      .limit(1),
  ]);

  // Every new organization starts with whichever of the company's purchased
  // modules are marked "default" (see DEFAULT_MODULE_KEYS) already enabled —
  // matches how the default organization is seeded at signup, see
  // lib/company/create-company.js.
  const purchased = new Set(parseModuleList(company?.purchasedModules));
  const enabledModules = DEFAULT_MODULE_KEYS.filter((key) => purchased.has(key));

  const [{ id: organizationId }] = await companyDb
    .insert(organizations)
    .values({
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
      enabledModules: JSON.stringify(enabledModules),
      organizationDbName,
      isDefault: 0,
    })
    .$returningId();

  const organizationDb = getOrganizationDb(organizationDbName);
  await organizationDb.insert(settings).values({
    organizationName: data.name,
    address: data.address,
    phone: data.phoneNumber || null,
    email: data.email || null,
    panNumber: data.panNumber || null,
    fiscalYearStart: data.accountingStartDate,
    defaultVatEnabled: data.isVatRegistered ? 1 : 0,
    currencySymbol: data.features.includes("multiCurrency") ? "NPR" : "NPR",
  });
  // Every new Organization DB starts with the 10 legacy default expense
  // categories (see purchase/expense-categories/actions.js) — mirrors
  // legacy's INSERT IGNORE seed. No-ops if categories already exist.
  await seedDefaultExpenseCategories(organizationDb);

  await companyDb
    .update(users)
    .set({ lastOrganizationId: organizationId })
    .where(eq(users.id, context.session.userId));

  const existingMembership = await companyDb
    .select({ id: organizationUsers.id })
    .from(organizationUsers)
    .where(
      and(
        eq(organizationUsers.organizationId, organizationId),
        eq(organizationUsers.userId, context.session.userId)
      )
    )
    .limit(1);

  if (!existingMembership.length) {
    await companyDb.insert(organizationUsers).values({
      organizationId,
      userId: context.session.userId,
      role: context.session.role,
      status: "active",
    });
  }

  await createSession({
    ...context.session,
    organizationId,
    organizationDbName,
  });

  revalidatePath(`/${companySlug}/account/organizations`);
  redirect(`/${companySlug}/account/organizations`);
}

export async function updateOrganizationAction(companySlug, organizationId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!["owner", "admin"].includes(context.session.role)) {
    return { ok: false, fieldErrors: {}, formError: "orgNotAllowed" };
  }

  const parsed = organizationUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const companyDb = getCompanyDb(context.session.companyDbName);
  const id = Number(organizationId);

  const [existing] = await companyDb
    .select({ id: organizations.id, organizationDbName: organizations.organizationDbName })
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);

  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "orgNotFound" };
  }

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
      isVatRegistered: data.isVatRegistered ? 1 : 0,
      email: data.email || null,
      phoneNumber: data.phoneNumber || null,
      panNumber: data.panNumber || null,
      website: data.website || null,
      logoUrl: data.logoUrl || null,
    })
    .where(eq(organizations.id, id));

  // Keep the Organization DB's own settings row (used by everything that
  // runs inside that organization, not just this admin screen) in sync —
  // same mirroring createOrganizationAction does at creation time.
  const organizationDb = getOrganizationDb(existing.organizationDbName);
  await organizationDb.update(settings).set({
    organizationName: data.name,
    address: data.address,
    phone: data.phoneNumber || null,
    email: data.email || null,
    panNumber: data.panNumber || null,
    defaultVatEnabled: data.isVatRegistered ? 1 : 0,
  });

  revalidatePath(`/${companySlug}/account/organizations`);
  return { ok: true, message: "orgUpdated" };
}

const negativeStockActionSchema = z.object({
  negativeStockAction: z.coerce.number().int().min(0).max(2),
});

/**
 * Writes just the one Settings field the Organization Settings page's
 * Inventory card actually lets an owner/admin edit — see
 * getOrganizationSettings above and db/schema/organization.js's
 * settings.negativeStockAction comment for what 0/1/2 mean. Kept separate
 * from updateOrganizationAction (which mirrors company-table fields into
 * Settings) since this is the only Settings-only field with its own editable
 * UI so far — same lookup-by-id-then-resolve-organizationDbName pattern as
 * that action, not context.session's org, since the org being edited here
 * isn't necessarily the one active in the current session.
 */
export async function updateNegativeStockActionAction(companySlug, organizationId, value) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!["owner", "admin"].includes(context.session.role)) {
    return { ok: false, fieldErrors: {}, formError: "orgNotAllowed" };
  }

  const parsed = negativeStockActionSchema.safeParse({ negativeStockAction: value });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(organizationId);
  const companyDb = getCompanyDb(context.session.companyDbName);
  const [existing] = await companyDb
    .select({ id: organizations.id, organizationDbName: organizations.organizationDbName })
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);
  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "orgNotFound" };
  }

  const organizationDb = getOrganizationDb(existing.organizationDbName);
  await organizationDb.update(settings).set({ negativeStockAction: parsed.data.negativeStockAction });

  revalidatePath(`/${companySlug}/account/organizations/${id}/settings`);
  return { ok: true, message: "orgUpdated", negativeStockAction: parsed.data.negativeStockAction };
}

/**
 * Adds a user directly, with the admin setting their password right now —
 * not an email invite. Sidesteps the schema wall a token-based invite would
 * hit (users.firebaseUid is NOT NULL UNIQUE, so there's no way to represent
 * "invited but hasn't signed in yet" without a bigger schema change): the
 * Firebase Admin SDK can create a real account server-side immediately
 * (unlike the client SDK, which can only sign in as whoever's using the
 * browser), so this account exists — with a real firebaseUid — the moment
 * this action returns. The admin is responsible for telling the new user
 * their email/password out of band; there's no email-sending step here.
 */
export async function addOrganizationUserAction(companySlug, organizationId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!["owner", "admin"].includes(context.session.role)) {
    return { ok: false, fieldErrors: {}, formError: "orgNotAllowed" };
  }

  const parsed = newUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const id = Number(organizationId);
  const companyDb = getCompanyDb(context.session.companyDbName);

  const [organization] = await companyDb
    .select({ id: organizations.id, enabledModules: organizations.enabledModules })
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);
  if (!organization) {
    return { ok: false, fieldErrors: {}, formError: "orgNotFound" };
  }

  // A member's grantable permissions are always a subset of what this
  // organization actually has enabled — never trust the client list as-is.
  const orgEnabledModules = new Set(parseModuleList(organization.enabledModules));
  const modulePermissions =
    data.role === "member" ? data.modulePermissions.filter((key) => orgEnabledModules.has(key)) : [];

  const [existingUser] = await companyDb
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, data.email))
    .limit(1);
  if (existingUser) {
    return { ok: false, fieldErrors: { email: ["emailAlreadyInCompany"] } };
  }

  // "invite" mode: nobody ever needs this password — the user sets their
  // own real one via the emailed reset link — so a random one just needs
  // to satisfy Firebase's own minimum, not be memorable.
  const accountPassword = data.mode === "invite" ? crypto.randomBytes(24).toString("hex") : data.password;

  let firebaseUid;
  try {
    const firebaseUser = await getAdminAuth().createUser({
      email: data.email,
      password: accountPassword,
      displayName: [data.firstName, data.lastName].filter(Boolean).join(" "),
    });
    firebaseUid = firebaseUser.uid;
  } catch (error) {
    if (error?.code === "auth/email-already-exists") {
      return { ok: false, fieldErrors: { email: ["emailAlreadyExists"] } };
    }
    if (error?.code === "auth/invalid-password") {
      return { ok: false, fieldErrors: { password: ["passwordTooShort"] } };
    }
    console.error("[organizations] addOrganizationUserAction Firebase createUser failed", error);
    return { ok: false, fieldErrors: {}, formError: "userAddFailed" };
  }

  const masterDb = getMasterDb();

  try {
    const [{ id: userId }] = await companyDb
      .insert(users)
      .values({
        firstName: data.firstName,
        lastName: data.lastName || null,
        email: data.email,
        phoneNumber: data.phoneNumber || null,
        firebaseUid,
        role: data.role,
        isActive: 1,
        lastOrganizationId: id,
      })
      .$returningId();

    await companyDb.insert(organizationUsers).values({
      organizationId: id,
      userId,
      role: data.role,
      // "invited" until they actually click the emailed link and sign in —
      // "active" immediately when the admin set a working password for
      // them directly, since they can already log in.
      status: data.mode === "invite" ? "invited" : "active",
      modulePermissions: JSON.stringify(modulePermissions),
    });

    await masterDb.insert(companyMembers).values({
      firebaseUid,
      companyId: context.session.companyId,
      companyUserId: userId,
    });
  } catch (error) {
    // The Firebase account was already created above — if the local rows
    // fail (e.g. a race on the email-uniqueness check), remove it rather
    // than leaving an orphaned Firebase account with no matching Company
    // data anywhere.
    console.error("[organizations] addOrganizationUserAction DB insert failed, rolling back Firebase user", error);
    await getAdminAuth().deleteUser(firebaseUid).catch(() => {});
    return { ok: false, fieldErrors: {}, formError: "userAddFailed" };
  }

  if (data.mode === "invite") {
    try {
      await sendInvitePasswordResetEmail(data.email);
    } catch (error) {
      // The account exists and is fully wired up either way — email
      // delivery failing shouldn't undo any of that or block the admin.
      // They can resend from Firebase Console, or the user can use
      // "Forgot password" on the login page themselves once they know
      // their email is registered.
      console.error("[organizations] sendInvitePasswordResetEmail failed", error);
      revalidatePath(`/${companySlug}/account/organizations/${id}/users`);
      return { ok: true, message: "userAddedEmailFailed" };
    }
  }

  revalidatePath(`/${companySlug}/account/organizations/${id}/users`);
  return { ok: true, message: data.mode === "invite" ? "userInvited" : "userAdded" };
}

/**
 * Sets which modules THIS organization uses — always constrained to a
 * subset of what the Company has purchased in the Module Store
 * (companies.purchasedModules). Enforced here server-side, not just by
 * greying out checkboxes in the UI — the request is silently filtered down
 * to only the purchased keys rather than rejected, since a module that was
 * purchased and then removed between page-load and save shouldn't be a
 * hard error, just quietly not re-added.
 */
export async function updateOrganizationModulesAction(companySlug, organizationId, moduleKeys) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!["owner", "admin"].includes(context.session.role)) {
    return { ok: false, formError: "orgNotAllowed" };
  }

  const id = Number(organizationId);
  const companyDb = getCompanyDb(context.session.companyDbName);
  const masterDb = getMasterDb();

  const [company] = await masterDb
    .select({ purchasedModules: companies.purchasedModules })
    .from(companies)
    .where(eq(companies.id, context.session.companyId))
    .limit(1);
  const purchased = new Set(parseModuleList(company?.purchasedModules));

  const requested = Array.isArray(moduleKeys) ? moduleKeys : [];
  // Default modules are always on — force them back in even if the client
  // didn't send them (the UI never offers a way to uncheck them, but this
  // is the actual guarantee, not just a greyed-out checkbox).
  const enabledModules = [
    ...new Set([...requested.filter((key) => purchased.has(key)), ...DEFAULT_MODULE_KEYS]),
  ];

  await companyDb
    .update(organizations)
    .set({ enabledModules: JSON.stringify(enabledModules) })
    .where(eq(organizations.id, id));

  revalidatePath(`/${companySlug}/account/organizations`);
  return { ok: true, enabledModules };
}

/**
 * Edits an existing member's profile (name/phone), role, and module access
 * in one go. The organization owner is protected from this entirely (return
 * orgOwnerProtected) so an admin can never accidentally lock the owner out
 * or strip their access — ownership transfer isn't built yet, that needs
 * its own explicit flow. Email is deliberately not editable here — it's
 * the Firebase login identity, changing it needs its own Firebase-aware
 * flow, not a plain DB update.
 */
export async function updateOrganizationUserAction(companySlug, organizationId, userId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!["owner", "admin"].includes(context.session.role)) {
    return { ok: false, fieldErrors: {}, formError: "orgNotAllowed" };
  }

  const parsed = userUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const id = Number(organizationId);
  const targetUserId = Number(userId);
  const companyDb = getCompanyDb(context.session.companyDbName);

  const [organization] = await companyDb
    .select({ enabledModules: organizations.enabledModules })
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);
  if (!organization) {
    return { ok: false, fieldErrors: {}, formError: "orgNotFound" };
  }

  const [membership] = await companyDb
    .select({ id: organizationUsers.id, role: organizationUsers.role })
    .from(organizationUsers)
    .where(and(eq(organizationUsers.organizationId, id), eq(organizationUsers.userId, targetUserId)))
    .limit(1);
  if (!membership) {
    return { ok: false, fieldErrors: {}, formError: "userNotFound" };
  }
  if (membership.role === "owner") {
    return { ok: false, fieldErrors: {}, formError: "orgOwnerProtected" };
  }

  const orgEnabledModules = new Set(parseModuleList(organization.enabledModules));
  const modulePermissions =
    data.role === "member" ? data.modulePermissions.filter((key) => orgEnabledModules.has(key)) : [];

  await Promise.all([
    companyDb
      .update(organizationUsers)
      .set({ role: data.role, modulePermissions: JSON.stringify(modulePermissions) })
      .where(eq(organizationUsers.id, membership.id)),
    companyDb
      .update(users)
      .set({
        firstName: data.firstName,
        lastName: data.lastName || null,
        phoneNumber: data.phoneNumber || null,
      })
      .where(eq(users.id, targetUserId)),
  ]);

  revalidatePath(`/${companySlug}/account/organizations`);
  return { ok: true, role: data.role, modulePermissions };
}
