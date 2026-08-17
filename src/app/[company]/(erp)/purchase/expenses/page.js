import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listExpenseCategories } from "../expense-categories/actions";
import { listBankAccountOptions, listExpenses, listPartyOptions } from "./actions";
import ExpensesView from "./expenses-view";

export const metadata = {
  title: "Expenses",
};

export default async function ExpensesPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  // Expenses lives under the "purchase" module key in this app's nav —
  // matches where legacy conceptually groups it (see
  // components/app-shell.jsx's ERP_NAV_SECTIONS).
  if (!context.accessibleModules.includes("purchase")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, expenseList, categories, parties, bankAccounts] = await Promise.all([
    getServerT(),
    listExpenses(company),
    listExpenseCategories(company),
    listPartyOptions(company),
    listBankAccountOptions(company),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("expenses")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("expensesSubtitle")}</p>
      </div>
      <ExpensesView
        companySlug={company}
        initialExpenses={expenseList}
        categories={categories}
        parties={parties}
        bankAccounts={bankAccounts}
      />
    </div>
  );
}
