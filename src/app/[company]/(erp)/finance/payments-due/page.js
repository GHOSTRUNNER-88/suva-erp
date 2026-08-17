import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listPaymentsDue } from "./actions";
import PaymentsDueView from "./payments-due-view";

export const metadata = {
  title: "Payments Due",
};

export default async function PaymentsDuePage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("finance")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, due] = await Promise.all([getServerT(), listPaymentsDue(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("paymentsDue")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("paymentsDueSubtitle")}</p>
      </div>
      <PaymentsDueView receivable={due.receivable} payable={due.payable} />
    </div>
  );
}
