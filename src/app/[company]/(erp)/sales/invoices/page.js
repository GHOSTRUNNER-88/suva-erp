import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listSalesInvoices } from "./actions";
import SalesInvoicesView from "./sales-invoices-view";

export const metadata = {
  title: "Sales Invoices",
};

export default async function SalesInvoicesPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("sales")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, invoices] = await Promise.all([getServerT(), listSalesInvoices(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("salesInvoices")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("salesInvoicesSubtitle")}</p>
      </div>
      <SalesInvoicesView companySlug={company} initialInvoices={invoices} />
    </div>
  );
}
