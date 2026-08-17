import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listExpenseCategories } from "./actions";
import ExpenseCategoriesView from "./expense-categories-view";

export const metadata = {
  title: "Expense Categories",
};

export default async function ExpenseCategoriesPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  // Expenses/Expense Categories live under the "purchase" module key in
  // this app's nav — matches where legacy conceptually groups them (see
  // components/app-shell.jsx's ERP_NAV_SECTIONS).
  if (!context.accessibleModules.includes("purchase")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, categories] = await Promise.all([getServerT(), listExpenseCategories(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("expenseCategories")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("expenseCategoriesSubtitle")}</p>
      </div>
      <ExpenseCategoriesView companySlug={company} initialCategories={categories} />
    </div>
  );
}
