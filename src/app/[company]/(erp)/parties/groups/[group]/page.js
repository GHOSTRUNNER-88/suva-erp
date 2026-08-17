import { notFound, redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getPartyGroupDetail, listPartiesByGroup } from "../../actions";
import GroupDetailView from "./group-detail-view";

export const metadata = {
  title: "Party Group",
};

export default async function PartyGroupDetailPage({ params }) {
  const { company, group } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("parties")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, groupDetail, groupParties] = await Promise.all([
    getServerT(),
    getPartyGroupDetail(company, group),
    listPartiesByGroup(company, group),
  ]);

  if (!groupDetail) {
    notFound();
  }

  return (
    <GroupDetailView
      companySlug={company}
      group={groupDetail}
      initialParties={groupParties}
      organization={context.activeOrganization}
      labels={{ back: t("partyGroups") }}
    />
  );
}
