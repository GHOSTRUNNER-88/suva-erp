import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listDebitNotes } from "./actions";
import DebitNotesView from "./debit-notes-view";

export const metadata = {
  title: "Debit Notes",
};

export default async function DebitNotesPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("purchase")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, debitNotes] = await Promise.all([getServerT(), listDebitNotes(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("debitNotes")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("debitNotesSubtitle")}</p>
      </div>
      <DebitNotesView companySlug={company} initialDebitNotes={debitNotes} />
    </div>
  );
}
