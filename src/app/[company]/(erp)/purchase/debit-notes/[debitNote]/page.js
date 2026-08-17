import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getDebitNoteDetail, getDebitNoteFormData } from "../actions";
import DebitNoteDetailView from "./debit-note-detail-view";

export const metadata = {
  title: "Debit Note",
};

export default async function DebitNoteDetailPage({ params }) {
  const { company, debitNote: debitNoteId } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("purchase")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, detail, formData] = await Promise.all([
    getServerT(),
    getDebitNoteDetail(company, debitNoteId),
    getDebitNoteFormData(company),
  ]);

  if (!detail) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <Link
        href={`/${company}/purchase/debit-notes`}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("debitNotes")}
      </Link>
      <DebitNoteDetailView companySlug={company} debitNote={detail.debitNote} lines={detail.lines} formData={formData} />
    </div>
  );
}
