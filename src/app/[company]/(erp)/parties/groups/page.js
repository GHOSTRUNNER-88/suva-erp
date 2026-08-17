import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listPartyGroups } from "../actions";
import PartyGroupsView from "./party-groups-view";

export const metadata = {
  title: "Party Groups",
};

export default async function PartyGroupsPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("parties")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, partyGroups] = await Promise.all([getServerT(), listPartyGroups(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("partyGroup")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("partyGroupsSubtitle")}</p>
      </div>
      <PartyGroupsView companySlug={company} initialGroups={partyGroups} />
    </div>
  );
}
