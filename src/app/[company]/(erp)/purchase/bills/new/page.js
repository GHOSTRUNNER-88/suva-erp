import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getPurchaseBillFormData } from "../actions";
import BillForm from "../bill-form";

export const metadata = {
  title: "New Purchase Bill",
};

// `fromOrder` (set by Purchase Orders' "Create Bill from this Order" button)
// is a JSON-encoded { partyId, warehouseId, lines[] } payload — a pure UI
// convenience, not a DB relationship (purchase_bills has no order_id
// column, see purchase/orders/actions.js's file header comment).
function parseFromOrder(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export default async function NewPurchaseBillPage({ params, searchParams }) {
  const { company } = await params;
  const { fromOrder } = await searchParams;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("purchase")) {
    redirect(`/${company}/dashboard`);
  }

  const prefill = parseFromOrder(fromOrder);
  const [t, formData] = await Promise.all([getServerT(), getPurchaseBillFormData(company, prefill?.warehouseId)]);

  return (
    <div className="space-y-5">
      <Link
        href={`/${company}/purchase/bills`}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("purchaseBills")}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("addPurchaseBill")}</h1>
      </div>
      <BillForm companySlug={company} mode="create" formData={formData} prefill={prefill} />
    </div>
  );
}
