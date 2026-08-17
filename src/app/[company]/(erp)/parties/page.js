import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listParties, listPartyGroups } from "./actions";
import PartiesView from "./parties-view";

export const metadata = {
  title: "Parties",
};

export default async function PartiesPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("parties")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, parties, partyGroups] = await Promise.all([
    getServerT(),
    listParties(company),
    listPartyGroups(company),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("parties")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("partiesSubtitle")}</p>
      </div>
      <PartiesView companySlug={company} initialParties={parties} partyGroups={partyGroups} />
    </div>
  );
}
