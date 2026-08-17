import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listSalesOrders } from "./actions";
import SalesOrdersView from "./sales-orders-view";

export const metadata = {
  title: "Sales Orders",
};

export default async function SalesOrdersPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("sales")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, orders] = await Promise.all([getServerT(), listSalesOrders(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("salesOrders")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("salesOrdersSubtitle")}</p>
      </div>
      <SalesOrdersView companySlug={company} initialOrders={orders} />
    </div>
  );
}
