import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listPartyGroups } from "../parties/actions";
import { listUnits } from "../units/actions";
import { listItemCategories, listItems } from "./actions";
import { listAttributesWithValues } from "./attributes/actions";
import ItemsView from "./items-view";

export const metadata = {
  title: "Items",
};

export default async function ItemsPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("items")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, items, categories, units, partyGroups, attributes] = await Promise.all([
    getServerT(),
    listItems(company),
    listItemCategories(company),
    listUnits(company),
    listPartyGroups(company),
    listAttributesWithValues(company),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("items")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("itemsSubtitle")}</p>
      </div>
      <ItemsView
        companySlug={company}
        initialItems={items}
        categories={categories}
        units={units}
        partyGroups={partyGroups}
        attributes={attributes}
      />
    </div>
  );
}
