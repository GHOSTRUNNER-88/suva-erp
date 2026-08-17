"use server";

import { listActiveBankAccountsForPicker, listPartiesForPicker, listPaymentsAction } from "../payments-shared/actions";

// Thin "in"-locked wrappers around payments-shared/actions.js, used by
// page.js only — the client form/list components import the shared
// paymentType-parameterized functions directly (see
// ../payments-shared/payment-form.jsx / payments-list-view.jsx).
export async function listPaymentsIn(companySlug) {
  return listPaymentsAction(companySlug, "in");
}

export async function listPartiesForPaymentIn(companySlug) {
  return listPartiesForPicker(companySlug);
}

export async function listBankAccountsForPaymentIn(companySlug) {
  return listActiveBankAccountsForPicker(companySlug);
}
