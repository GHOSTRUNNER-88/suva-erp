import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listItemCategories, listWarehouses } from "../actions";
import { listInventoryTree } from "./actions";
import InventoryView from "./inventory-view";

export const metadata = {
  title: "Inventory",
};

export default async function InventoryPage({ params, searchParams }) {
  const { company } = await params;
  const { warehouse } = await searchParams;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("items")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, tree, warehouses, categories] = await Promise.all([
    getServerT(),
    listInventoryTree(company, { warehouseId: warehouse }),
    listWarehouses(company),
    listItemCategories(company),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("inventory")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("inventorySubtitle")}</p>
      </div>
      <InventoryView
        companySlug={company}
        initialTree={tree}
        warehouses={warehouses}
        categories={categories}
        activeWarehouseId={warehouse ?? ""}
        organization={context.activeOrganization}
      />
    </div>
  );
}
