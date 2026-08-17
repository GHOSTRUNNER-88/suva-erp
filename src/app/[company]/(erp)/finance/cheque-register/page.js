import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getChequeAttentionCounts, listBankAccountsForCheques, listCheques, listPartiesForCheques } from "./actions";
import ChequeRegisterView from "./cheque-register-view";

export const metadata = {
  title: "Cheque Register",
};

export default async function ChequeRegisterPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("finance")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, cheques, parties, bankAccounts, attentionCounts] = await Promise.all([
    getServerT(),
    listCheques(company),
    listPartiesForCheques(company),
    listBankAccountsForCheques(company),
    getChequeAttentionCounts(company),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("chequeRegister")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("chequeRegisterSubtitle")}</p>
      </div>
      <ChequeRegisterView
        companySlug={company}
        initialCheques={cheques}
        parties={parties}
        bankAccounts={bankAccounts}
        attentionCounts={attentionCounts}
      />
    </div>
  );
}
