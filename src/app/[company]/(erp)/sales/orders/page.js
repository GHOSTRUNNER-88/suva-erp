import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { listSalesOrders } from "./actions";
import SalesOrdersView from "./sales-orders-view";

export const metadata = {
  title: "Sales Orders",
};

const STATUS_KEYS = ["draft", "confirmed", "converted", "cancelled"];

export default async function SalesOrdersPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("sales")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, orders] = await Promise.all([getServerT(), listSalesOrders(company)]);

  // Real counts from the same rows the table renders — never a second,
  // possibly-diverging query. Omitted entirely when there's nothing to
  // summarize yet (see redesign2.md: "only implement statuses that
  // actually exist" / don't show a row of zeros on a brand-new list).
  const stats =
    orders.length > 0
      ? [
          { label: t("allOrders"), value: orders.length },
          ...STATUS_KEYS.map((status) => ({ label: t(status), value: orders.filter((order) => order.status === status).length })),
        ]
      : undefined;

  return (
    <div>
      <PageHeader
        title={t("salesOrders")}
        description={t("salesOrdersSubtitle")}
        stats={stats}
        action={
          <Link href={`/${company}/sales/orders/new`} className={buttonVariants({})}>
            <Plus className="h-4 w-4" />
            {t("addSalesOrder")}
          </Link>
        }
      />
      <SalesOrdersView companySlug={company} initialOrders={orders} />
    </div>
  );
}
