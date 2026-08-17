import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Footer } from "@/components/footer";
import { companies } from "@/db/schema/master";
import { organizations } from "@/db/schema/company";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getCompanyDb, getMasterDb } from "@/lib/db";
import { getServerT } from "@/lib/i18n-server";
import OrganizationWizard from "../account/organizations/new/organization-wizard";
import { completeDefaultOrganizationAction } from "./actions";

export const metadata = {
  title: "Set Up Your Organization",
};

export default async function SetupPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!["owner", "admin"].includes(context.session.role)) {
    redirect(`/${company}/dashboard`);
  }

  const companyDb = getCompanyDb(context.session.companyDbName);
  const [t, [companyRow], [defaultOrganization]] = await Promise.all([
    getServerT(),
    getMasterDb()
      .select({ name: companies.name, panNumber: companies.panNumber })
      .from(companies)
      .where(eq(companies.id, context.session.companyId))
      .limit(1),
    companyDb
      .select({ accountingStartDate: organizations.accountingStartDate })
      .from(organizations)
      .where(eq(organizations.isDefault, 1))
      .limit(1),
  ]);

  // Session-stale defense: if setup was already completed (e.g. this tab
  // still has an old session snapshot, or the user bookmarked this URL),
  // don't show the wizard again — it would reject on submit anyway (see
  // completeDefaultOrganizationAction).
  if (defaultOrganization?.accountingStartDate) {
    redirect(`/${company}/account/dashboard`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <div className="flex flex-1 items-center justify-center p-4 py-10">
        <div className="w-full max-w-6xl">
          <OrganizationWizard
            companySlug={company}
            defaultPanNumber={companyRow?.panNumber ?? ""}
            submitAction={completeDefaultOrganizationAction}
            initialValues={{ name: companyRow?.name ?? "" }}
            heading={t("setupWelcomeTitle")}
            subheading={t("setupWelcomeSubtitle")}
          />
        </div>
      </div>
      <Footer />
    </div>
  );
}
