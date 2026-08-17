import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getPartyLedger } from "../actions";
import { PartyLedgerView } from "../party-ledger-view";

export const metadata = {
  title: "Party Ledger",
};

export default async function PartyLedgerPage({ params }) {
  const { company, party } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("parties")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, ledger] = await Promise.all([getServerT(), getPartyLedger(company, party)]);

  if (!ledger) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <Link
        href={`/${company}/parties`}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("parties")}
      </Link>
      <PartyLedgerView party={ledger.party} entries={ledger.entries} organization={context.activeOrganization} />
    </div>
  );
}
