import { parseModuleList } from "@/lib/modules";

/**
 * Organization-level role model — deliberately flatter than the legacy
 * app's 8 fixed named roles (Admin/Sales/Purchase/Finance/Accounts/Reports/
 * Payroll Manager/Maskebari). Instead of picking one bundle, a member gets
 * an explicit, editable set of module keys (organizationUsers.modulePermissions)
 * so "Sales + Cash & Bank" or any other combination is just as easy to grant
 * as any single legacy role was.
 *
 * - owner: full access to everything, always. Can't be edited/demoted via
 *   updateOrganizationUserAction (see actions.js) — an organization always
 *   needs at least one.
 * - admin: full access to every module the organization has enabled (the
 *   legacy app's "Admin" role) — modulePermissions is ignored for this role.
 * - member: access limited to the modules listed in modulePermissions,
 *   which is itself always a subset of the organization's enabledModules.
 */
export const ORGANIZATION_ROLES = ["owner", "admin", "member"];

export function parseModulePermissions(value) {
  return parseModuleList(value);
}

export function hasModuleAccess(organizationRole, modulePermissions, moduleKey) {
  if (organizationRole === "owner" || organizationRole === "admin") return true;
  return parseModulePermissions(modulePermissions).includes(moduleKey);
}
