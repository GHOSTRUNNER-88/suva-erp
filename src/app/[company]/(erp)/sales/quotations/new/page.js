import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getSalesQuotationFormData } from "../actions";
import SalesQuotationForm from "../quotation-form";

export const metadata = {
  title: "New Sales Quotation",
};

export default async function NewSalesQuotationPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("sales")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, formData] = await Promise.all([getServerT(), getSalesQuotationFormData(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("addSalesQuotation")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("quotationsSubtitle")}</p>
      </div>
      <SalesQuotationForm companySlug={company} formData={formData} quotation={null} lines={[]} />
    </div>
  );
}
