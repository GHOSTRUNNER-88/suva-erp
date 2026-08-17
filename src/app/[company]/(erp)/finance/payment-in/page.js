import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import PaymentsListView from "../payments-shared/payments-list-view";
import { listBankAccountsForPaymentIn, listPartiesForPaymentIn, listPaymentsIn } from "./actions";

export const metadata = {
  title: "Payment In",
};

export default async function PaymentInPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("finance")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, payments, parties, bankAccounts] = await Promise.all([
    getServerT(),
    listPaymentsIn(company),
    listPartiesForPaymentIn(company),
    listBankAccountsForPaymentIn(company),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("paymentIn")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("paymentInSubtitle")}</p>
      </div>
      <PaymentsListView companySlug={company} paymentType="in" initialPayments={payments} parties={parties} bankAccounts={bankAccounts} />
    </div>
  );
}
