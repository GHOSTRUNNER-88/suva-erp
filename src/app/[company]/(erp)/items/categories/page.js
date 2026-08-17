import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listItemCategories } from "../actions";
import ItemCategoriesView from "./item-categories-view";

export const metadata = {
  title: "Item Categories",
};

export default async function ItemCategoriesPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("items")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, categories] = await Promise.all([getServerT(), listItemCategories(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("itemCategories")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("itemCategoriesSubtitle")}</p>
      </div>
      <ItemCategoriesView companySlug={company} initialCategories={categories} />
    </div>
  );
}
