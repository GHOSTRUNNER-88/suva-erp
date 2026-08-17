import AppShell from "@/components/app-shell";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";

export default async function AccountLayout({ children, params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  return (
    <AppShell
      companySlug={context.session.companySlug}
      user={context.user}
      organizations={context.organizations}
      activeOrganization={context.activeOrganization}
      mode="account"
    >
      {children}
    </AppShell>
  );
}
