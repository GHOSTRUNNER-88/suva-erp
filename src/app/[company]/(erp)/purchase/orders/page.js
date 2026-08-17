import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listPurchaseOrders } from "./actions";
import PurchaseOrdersView from "./purchase-orders-view";

export const metadata = {
  title: "Purchase Orders",
};

export default async function PurchaseOrdersPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("purchase")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, orders] = await Promise.all([getServerT(), listPurchaseOrders(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("purchaseOrders")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("purchaseOrdersSubtitle")}</p>
      </div>
      <PurchaseOrdersView companySlug={company} initialOrders={orders} />
    </div>
  );
}
