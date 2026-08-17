import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { organizations, organizationUsers, users } from "@/db/schema/company";
import { getSession } from "@/lib/auth/session";
import { getCompanyDb } from "@/lib/db";
import { hasModuleAccess } from "@/lib/permissions";
import { parseModuleList } from "@/lib/modules";

export async function getAuthenticatedAppContext(companySlug) {
  const session = await getSession();

  if (!session.userId || session.companySlug !== companySlug) {
    redirect("/login");
  }

  const companyDb = getCompanyDb(session.companyDbName);
  const [user] = await companyDb
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phoneNumber: users.phoneNumber,
      role: users.role,
      isActive: users.isActive,
      lastOrganizationId: users.lastOrganizationId,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user || !user.isActive) {
    redirect("/login");
  }

  const organizationRows = await companyDb
    .select({
      id: organizations.id,
      name: organizations.name,
      organizationDbName: organizations.organizationDbName,
      isDefault: organizations.isDefault,
      enabledModules: organizations.enabledModules,
      logoUrl: organizations.logoUrl,
    })
    .from(organizations);

  const activeOrganization =
    organizationRows.find((organization) => organization.id === session.organizationId) ??
    organizationRows.find((organization) => organization.isDefault) ??
    organizationRows[0] ??
    null;

  // The user's role/module access WITHIN activeOrganization — a separate
  // axis from session.role (the company-wide role, which only gates the
  // /account/* company-admin area, see proxy.js). Falls back to "member"
  // with no modules if the membership row is somehow missing (shouldn't
  // happen for an authenticated session, but never grant access silently).
  let organizationRole = "member";
  let accessibleModules = [];
  if (activeOrganization) {
    const [membership] = await companyDb
      .select({ role: organizationUsers.role, modulePermissions: organizationUsers.modulePermissions })
      .from(organizationUsers)
      .where(
        and(eq(organizationUsers.organizationId, activeOrganization.id), eq(organizationUsers.userId, user.id))
      )
      .limit(1);
    organizationRole = membership?.role ?? "member";
    const enabledModules = parseModuleList(activeOrganization.enabledModules);
    accessibleModules = enabledModules.filter((moduleKey) =>
      hasModuleAccess(organizationRole, membership?.modulePermissions, moduleKey)
    );
  }

  return {
    session: {
      userId: session.userId,
      role: session.role,
      companyId: session.companyId,
      companySlug: session.companySlug,
      companyDbName: session.companyDbName,
      organizationId: session.organizationId,
      organizationDbName: session.organizationDbName,
    },
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
    },
    organizations: organizationRows,
    activeOrganization,
    organizationRole,
    accessibleModules,
  };
}
