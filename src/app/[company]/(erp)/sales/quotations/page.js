import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listSalesQuotations } from "./actions";
import SalesQuotationsView from "./sales-quotations-view";

export const metadata = {
  title: "Sales Quotations",
};

export default async function SalesQuotationsPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("sales")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, quotations] = await Promise.all([getServerT(), listSalesQuotations(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("quotations")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("quotationsSubtitle")}</p>
      </div>
      <SalesQuotationsView companySlug={company} initialQuotations={quotations} />
    </div>
  );
}
