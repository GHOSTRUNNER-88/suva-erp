import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getBankAccountLedger, listBankAccountsWithBalance } from "../actions";
import { BankAccountLedgerView } from "../bank-account-ledger-view";

export const metadata = {
  title: "Bank Account",
};

export default async function BankAccountLedgerPage({ params, searchParams }) {
  const { company, account } = await params;
  const { from, to } = await searchParams;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("cashBank")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, ledger, bankAccounts] = await Promise.all([
    getServerT(),
    getBankAccountLedger(company, account, { from, to }),
    listBankAccountsWithBalance(company),
  ]);

  if (!ledger) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <Link
        href={`/${company}/bank-accounts`}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("bankAccounts")}
      </Link>
      <BankAccountLedgerView
        companySlug={company}
        account={ledger.account}
        transactions={ledger.transactions}
        currentBalance={ledger.currentBalance}
        openingBalanceBeforeFilter={ledger.openingBalanceBeforeFilter}
        totalCredit={ledger.totalCredit}
        totalDebit={ledger.totalDebit}
        filter={{ from: from ?? "", to: to ?? "" }}
        bankAccounts={bankAccounts}
      />
    </div>
  );
}
