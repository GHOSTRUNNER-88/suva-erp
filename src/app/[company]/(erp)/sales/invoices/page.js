import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import {
  getDocumentDefaults,
  listBankAccountsForInvoices,
  listItemsForInvoices,
  listPartiesForInvoices,
  listSalesInvoices,
  listWarehousesForInvoices,
} from "./actions";
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

  const [t, invoices, parties, items, warehouses, bankAccounts, defaults] = await Promise.all([
    getServerT(),
    listSalesInvoices(company),
    listPartiesForInvoices(company),
    listItemsForInvoices(company),
    listWarehousesForInvoices(company),
    listBankAccountsForInvoices(company),
    getDocumentDefaults(company),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("salesInvoices")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("salesInvoicesSubtitle")}</p>
      </div>
      <SalesInvoicesView
        companySlug={company}
        initialInvoices={invoices}
        parties={parties}
        items={items}
        warehouses={warehouses}
        bankAccounts={bankAccounts}
        defaults={defaults}
      />
    </div>
  );
}
