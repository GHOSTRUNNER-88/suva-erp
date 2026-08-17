import { eq } from "drizzle-orm";
import { companies } from "@/db/schema/master";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getMasterDb } from "@/lib/db";
import OrganizationWizard from "./organization-wizard";

export const metadata = {
  title: "Add Organization",
};

export default async function NewOrganizationPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);
  const [companyRow] = await getMasterDb()
    .select({ panNumber: companies.panNumber })
    .from(companies)
    .where(eq(companies.id, context.session.companyId))
    .limit(1);

  return <OrganizationWizard companySlug={company} defaultPanNumber={companyRow?.panNumber ?? ""} />;
}
