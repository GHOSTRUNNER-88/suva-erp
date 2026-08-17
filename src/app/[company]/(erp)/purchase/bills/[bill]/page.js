import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getPurchaseBillDetail, getPurchaseBillFormData } from "../actions";
import BillDetailView from "./bill-detail-view";

export const metadata = {
  title: "Purchase Bill",
};

export default async function PurchaseBillDetailPage({ params }) {
  const { company, bill: billId } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("purchase")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, detail, formData] = await Promise.all([
    getServerT(),
    getPurchaseBillDetail(company, billId),
    getPurchaseBillFormData(company),
  ]);

  if (!detail) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <Link
        href={`/${company}/purchase/bills`}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("purchaseBills")}
      </Link>
      <BillDetailView companySlug={company} bill={detail.bill} lines={detail.lines} formData={formData} />
    </div>
  );
}
