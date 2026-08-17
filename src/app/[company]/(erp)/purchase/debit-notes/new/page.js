import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getDebitNoteFormData } from "../actions";
import DebitNoteForm from "../debit-note-form";

export const metadata = {
  title: "New Debit Note",
};

export default async function NewDebitNotePage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("purchase")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, formData] = await Promise.all([getServerT(), getDebitNoteFormData(company)]);

  return (
    <div className="space-y-5">
      <Link
        href={`/${company}/purchase/debit-notes`}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("debitNotes")}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("addDebitNote")}</h1>
      </div>
      <DebitNoteForm companySlug={company} mode="create" formData={formData} />
    </div>
  );
}
