import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listCreditNotes } from "./actions";
import CreditNotesView from "./credit-notes-view";

export const metadata = {
  title: "Credit Notes",
};

export default async function CreditNotesPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("sales")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, creditNotes] = await Promise.all([getServerT(), listCreditNotes(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("creditNotes")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("creditNotesSubtitle")}</p>
      </div>
      <CreditNotesView companySlug={company} initialCreditNotes={creditNotes} />
    </div>
  );
}
