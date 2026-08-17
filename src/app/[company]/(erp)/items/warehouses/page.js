import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listWarehouses } from "../actions";
import WarehousesView from "./warehouses-view";

export const metadata = {
  title: "Warehouses",
};

export default async function WarehousesPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("items")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, warehouses] = await Promise.all([getServerT(), listWarehouses(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("warehouses")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("warehousesSubtitle")}</p>
      </div>
      <WarehousesView companySlug={company} initialWarehouses={warehouses} />
    </div>
  );
}
