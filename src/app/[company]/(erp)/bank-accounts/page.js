import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listBankAccountsWithBalance } from "./actions";
import BankAccountsView from "./bank-accounts-view";

export const metadata = {
  title: "Bank Accounts",
};

export default async function BankAccountsPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("cashBank")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, bankAccounts] = await Promise.all([getServerT(), listBankAccountsWithBalance(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("bankAccounts")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("bankAccountsSubtitle")}</p>
      </div>
      <BankAccountsView companySlug={company} initialBankAccounts={bankAccounts} />
    </div>
  );
}
