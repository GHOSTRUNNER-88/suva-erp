import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getCreditNoteDetail, getCreditNoteFormData } from "../actions";
import CreditNoteDetailView from "./credit-note-detail-view";

export const metadata = {
  title: "Credit Note",
};

export default async function CreditNoteDetailPage({ params }) {
  const { company, creditNote: creditNoteId } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("sales")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, detail, formData] = await Promise.all([
    getServerT(),
    getCreditNoteDetail(company, creditNoteId),
    getCreditNoteFormData(company),
  ]);

  if (!detail) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <Link
        href={`/${company}/sales/credit-notes`}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("creditNotes")}
      </Link>
      <CreditNoteDetailView companySlug={company} creditNote={detail.creditNote} lines={detail.lines} formData={formData} />
    </div>
  );
}
