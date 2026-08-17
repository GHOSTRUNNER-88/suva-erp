import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getPurchaseOrderFormData } from "../actions";
import OrderForm from "../order-form";

export const metadata = {
  title: "New Purchase Order",
};

export default async function NewPurchaseOrderPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("purchase")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, formData] = await Promise.all([getServerT(), getPurchaseOrderFormData(company)]);

  return (
    <div className="space-y-5">
      <Link
        href={`/${company}/purchase/orders`}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("purchaseOrders")}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("addPurchaseOrder")}</h1>
      </div>
      <OrderForm companySlug={company} mode="create" formData={formData} />
    </div>
  );
}
