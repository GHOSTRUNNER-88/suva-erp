"use server";

import { listActiveBankAccountsForPicker, listPartiesForPicker, listPaymentsAction } from "../payments-shared/actions";

// Thin "out"-locked wrappers around payments-shared/actions.js, used by
// page.js only — the client form/list components import the shared
// paymentType-parameterized functions directly (see
// ../payments-shared/payment-form.jsx / payments-list-view.jsx).
export async function listPaymentsOut(companySlug) {
  return listPaymentsAction(companySlug, "out");
}

export async function listPartiesForPaymentOut(companySlug) {
  return listPartiesForPicker(companySlug);
}

export async function listBankAccountsForPaymentOut(companySlug) {
  return listActiveBankAccountsForPicker(companySlug);
}
