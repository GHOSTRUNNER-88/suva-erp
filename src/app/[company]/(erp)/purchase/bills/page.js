import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listPurchaseBills } from "./actions";
import PurchaseBillsView from "./purchase-bills-view";

export const metadata = {
  title: "Purchase Bills",
};

export default async function PurchaseBillsPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("purchase")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, bills] = await Promise.all([getServerT(), listPurchaseBills(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("purchaseBills")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("purchaseBillsSubtitle")}</p>
      </div>
      <PurchaseBillsView companySlug={company} initialBills={bills} />
    </div>
  );
}
