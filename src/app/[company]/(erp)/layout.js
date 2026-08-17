import AppShell from "@/components/app-shell";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";

/**
 * Shared by every ERP workspace route (dashboard, units, parties, items,
 * and future modules) via this route group — one AppShell wrapper instead
 * of copy-pasting the same context-fetch + AppShell props into every
 * module's own layout.js. /account/* has its own separate layout
 * (mode="account"); /setup deliberately has none (standalone, see
 * app/[company]/setup/page.js).
 */
export default async function ErpLayout({ children, params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  return (
    <AppShell
      companySlug={context.session.companySlug}
      user={context.user}
      organizations={context.organizations}
      activeOrganization={context.activeOrganization}
      accessibleModules={context.accessibleModules}
    >
      {children}
    </AppShell>
  );
}
