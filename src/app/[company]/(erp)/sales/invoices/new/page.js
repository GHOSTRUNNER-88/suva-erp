import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getSalesInvoiceFormData } from "../actions";
import InvoiceForm from "../invoice-form";

export const metadata = {
  title: "New Sales Invoice",
};

export default async function NewSalesInvoicePage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("sales")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, formData] = await Promise.all([getServerT(), getSalesInvoiceFormData(company)]);

  return (
    <div className="space-y-5">
      <Link
        href={`/${company}/sales/invoices`}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("salesInvoices")}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("addSalesInvoice")}</h1>
      </div>
      <InvoiceForm companySlug={company} mode="create" formData={formData} />
    </div>
  );
}
