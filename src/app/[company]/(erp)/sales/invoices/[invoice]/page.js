import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import {
  getDocumentDefaults,
  getSalesInvoiceDetail,
  listBankAccountsForInvoices,
  listItemsForInvoices,
  listPartiesForInvoices,
  listWarehousesForInvoices,
} from "../actions";
import { InvoiceDetailView } from "./invoice-detail-view";

export const metadata = {
  title: "Sales Invoice",
};

export default async function SalesInvoiceDetailPage({ params }) {
  const { company, invoice } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("sales")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, detail, parties, items, warehouses, bankAccounts, defaults] = await Promise.all([
    getServerT(),
    getSalesInvoiceDetail(company, invoice),
    listPartiesForInvoices(company),
    listItemsForInvoices(company),
    listWarehousesForInvoices(company),
    listBankAccountsForInvoices(company),
    getDocumentDefaults(company),
  ]);

  if (!detail) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <Link
        href={`/${company}/sales/invoices`}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("salesInvoices")}
      </Link>
      <InvoiceDetailView
        companySlug={company}
        invoice={detail.invoice}
        lines={detail.lines}
        parties={parties}
        items={items}
        warehouses={warehouses}
        bankAccounts={bankAccounts}
        defaults={defaults}
      />
    </div>
  );
}
