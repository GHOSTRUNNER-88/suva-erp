import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listDeliveryChallans } from "./actions";
import DeliveryChallansView from "./delivery-challans-view";

export const metadata = {
  title: "Delivery Challans",
};

export default async function DeliveryChallansPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("sales")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, challans] = await Promise.all([getServerT(), listDeliveryChallans(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("deliveryChallans")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("deliveryChallansSubtitle")}</p>
      </div>
      <DeliveryChallansView companySlug={company} initialChallans={challans} />
    </div>
  );
}
