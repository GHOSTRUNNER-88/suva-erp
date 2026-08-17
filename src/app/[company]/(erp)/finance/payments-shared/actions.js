"use server";

import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  bankAccounts,
  bankTransactions,
  parties,
  paymentAllocations,
  payments,
  purchaseBills,
  salesInvoices,
} from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { padNumber } from "@/lib/document-numbering";
import { round2 } from "@/lib/money";
import { recalculatePartyBalance } from "@/lib/party-ledger";
import { z } from "zod";

/**
 * Shared Payment In / Payment Out logic — ported from legacy
 * models/Payment.php (verified in full) + models/BankTransaction.php. Both
 * finance/payment-in/actions.js and finance/payment-out/actions.js are thin
 * wrappers around this file with `paymentType` fixed to "in"/"out", per
 * ../../../../AGENTS.md's finance-module brief. See
 * ../../../../db/schema/organization.js for `payments`/`paymentAllocations`.
 *
 * Key legacy-fidelity findings (also in the build report):
 * - receiptNumber: separate sequence PER payment_type, not shared — prefix
 *   "PMT-IN-"/"PMT-OUT-" + zero-padded MAX(payment_id WHERE payment_type=X)+1
 *   (get_next_receipt_number()). Note this MAXes over `payments.id`, a
 *   single autoincrement shared by both types, so the numeric suffix can
 *   jump/skip depending on how in/out rows interleave — a verified legacy
 *   quirk, not a bug, preserved as-is. Locked (not client-editable) once
 *   assigned, same treatment as invoice/credit-note/debit-note numbers.
 * - Allocation is entirely MANUAL (get_open_sales_invoices_for_party /
 *   get_open_purchase_bills_for_party + apply_payment_allocations) — a
 *   payment can carry zero allocations (a valid on-account receipt).
 * - due/paid amounts: legacy increments in place (apply_payment_allocations
 *   / reverse_payment_allocations); per this build's explicit instruction we
 *   instead always recompute from SUM(payment_allocations) — see
 *   syncDocumentDueAmount below — mathematically equivalent, safer against
 *   drift.
 * - Every payment posts a bank_transactions row immediately on create,
 *   full amount, no deferral — there is no "payment method" column on
 *   `payments` in legacy or here, so nothing to defer on.
 */

function canAccessFinance(context) {
  return context.accessibleModules.includes("finance");
}

function documentTypeFor(paymentType) {
  return paymentType === "in" ? "sales_invoice" : "purchase_bill";
}

function txnTypeNameFor(paymentType) {
  return paymentType === "in" ? "payment_in" : "payment_out";
}

const allocationInputSchema = z.object({
  documentId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
});

const paymentSchema = z.object({
  paymentDate: z.string().trim().min(1, "paymentDateRequired"),
  partyId: z.coerce.number().int().min(0).default(0),
  bankAccountId: z.coerce.number().int().positive("bankAccountRequired"),
  amount: z.coerce.number().positive("amountRequired"),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  allocations: z.array(allocationInputSchema).default([]),
});

function revalidateFinancePaths(companySlug, paymentType, bankAccountIds) {
  const route = paymentType === "in" ? "payment-in" : "payment-out";
  revalidatePath(`/${companySlug}/finance/${route}`);
  revalidatePath(`/${companySlug}/finance/payments-due`);
  revalidatePath(`/${companySlug}/bank-accounts`);
  for (const id of new Set([...(Array.isArray(bankAccountIds) ? bankAccountIds : [bankAccountIds])].filter(Boolean))) {
    revalidatePath(`/${companySlug}/bank-accounts/${id}`);
  }
}

// Mirrors legacy get_next_receipt_number(): a per-type suggestion computed
// as MAX(payment_id WHERE payment_type = X) + 1, zero-padded to 4 — NOT a
// pure per-type counter, since payment_id itself is one shared autoincrement
// across both types (see file header note).
async function nextReceiptNumber(db, paymentType) {
  const prefix = paymentType === "in" ? "PMT-IN-" : "PMT-OUT-";
  const [row] = await db
    .select({ maxId: sql`MAX(${payments.id})` })
    .from(payments)
    .where(eq(payments.paymentType, paymentType));
  const nextId = Number(row?.maxId ?? 0) + 1;
  return `${prefix}${padNumber(nextId)}`;
}

// Recomputes a sales_invoice/purchase_bill's paid/due/settled columns from
// SUM(payment_allocations) for that document — deliberately NOT legacy's
// increment-in-place approach (apply_payment_allocations/
// reverse_payment_allocations both nudge received_amount/due_amount by a
// delta), per this build's explicit instruction: recomputing from scratch
// every time is safer against drift and produces the identical result when
// nothing has gone wrong. Same "always recompute, never nudge" spirit as
// lib/party-ledger.js's recalculatePartyBalance.
async function syncDocumentDueAmount(db, documentType, documentId) {
  const isSales = documentType === "sales_invoice";
  const table = isSales ? salesInvoices : purchaseBills;

  const [sumRow] = await db
    .select({ total: sql`COALESCE(SUM(${paymentAllocations.allocatedAmount}), 0)` })
    .from(paymentAllocations)
    .where(and(eq(paymentAllocations.documentType, documentType), eq(paymentAllocations.documentId, documentId)));

  const [doc] = await db.select({ totalAmount: table.totalAmount }).from(table).where(eq(table.id, documentId)).limit(1);
  if (!doc) return;

  const paidAmount = round2(Number(sumRow?.total ?? 0));
  const dueAmount = round2(Math.max(0, Number(doc.totalAmount) - paidAmount));
  const isSettled = dueAmount <= 0.004 ? 1 : 0;

  if (isSales) {
    await db
      .update(salesInvoices)
      .set({ receivedAmount: paidAmount.toFixed(2), dueAmount: dueAmount.toFixed(2), isReceived: isSettled })
      .where(eq(salesInvoices.id, documentId));
  } else {
    await db
      .update(purchaseBills)
      .set({ paidAmount: paidAmount.toFixed(2), dueAmount: dueAmount.toFixed(2), isPaid: isSettled })
      .where(eq(purchaseBills.id, documentId));
  }
}

// Mirrors legacy get_open_sales_invoices_for_party()/
// get_open_purchase_bills_for_party() + payment_reserved_by_document(): open
// (status != cancelled, dueAmount > 0) documents for a party, oldest first.
// When editing an existing payment (excludePaymentId set), that payment's
// own current allocations are still live in the DB at this point (the
// mutation hasn't run yet) — add them back to dueAmount for display so the
// picker doesn't show this payment's own documents as already fully paid.
export async function getOpenDocumentsForPartyAction(companySlug, paymentType, partyId, excludePaymentId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return [];
  const id = Number(partyId);
  if (!id || id <= 0) return [];
  const db = getOrganizationDb(context.session.organizationDbName);

  const isSales = paymentType === "in";
  const table = isSales ? salesInvoices : purchaseBills;
  const documentType = documentTypeFor(paymentType);
  const numberCol = isSales ? table.invoiceNumber : table.billNumber;
  const dateCol = isSales ? table.invoiceDate : table.billDate;

  const rows = await db
    .select({
      documentId: table.id,
      documentNo: numberCol,
      documentDate: dateCol,
      totalAmount: table.totalAmount,
      dueAmount: table.dueAmount,
    })
    .from(table)
    .where(and(eq(table.partyId, id), ne(table.status, "cancelled"), sql`${table.dueAmount} > 0`))
    .orderBy(asc(dateCol), asc(table.id));

  let reserved = new Map();
  const excludeId = Number(excludePaymentId) || 0;
  if (excludeId > 0) {
    const reservedRows = await db
      .select({ documentId: paymentAllocations.documentId, amt: sql`SUM(${paymentAllocations.allocatedAmount})` })
      .from(paymentAllocations)
      .where(and(eq(paymentAllocations.documentType, documentType), eq(paymentAllocations.paymentId, excludeId)))
      .groupBy(paymentAllocations.documentId);
    reserved = new Map(reservedRows.map((r) => [r.documentId, Number(r.amt)]));
  }

  return rows
    .map((row) => ({
      documentId: row.documentId,
      documentNo: row.documentNo,
      documentDate: row.documentDate,
      totalAmount: Number(row.totalAmount),
      dueAmount: round2(Number(row.dueAmount) + (reserved.get(row.documentId) ?? 0)),
    }))
    .filter((row) => row.dueAmount > 0.004);
}

// Re-validates allocations against fresh DB state (never trust client
// totals — AGENTS.md §5): each document must belong to the payment's party,
// not be cancelled, and its allocation must not exceed its CURRENT
// dueAmount; the allocations' sum must not exceed the payment amount (the
// remainder is the on-account/unallocated portion). For updatePaymentAction
// this runs AFTER the old allocations have been deleted and the affected
// documents resynced, so "current dueAmount" already excludes this
// payment's own prior contribution — no separate reservation math needed
// here (unlike the picker above, which reads live state before the mutation).
async function validateAllocations(db, paymentType, partyId, amount, allocations) {
  if (allocations.length === 0) return { ok: true, documentType: documentTypeFor(paymentType) };

  const documentType = documentTypeFor(paymentType);
  const isSales = paymentType === "in";
  const table = isSales ? salesInvoices : purchaseBills;

  const totalAllocated = round2(allocations.reduce((sum, a) => sum + a.amount, 0));
  if (totalAllocated > amount + 0.004) {
    return { ok: false, formError: "allocationExceedsAmount" };
  }

  const ids = allocations.map((a) => a.documentId);
  const docs = await db
    .select({ id: table.id, partyId: table.partyId, dueAmount: table.dueAmount, status: table.status })
    .from(table)
    .where(inArray(table.id, ids));
  const docMap = new Map(docs.map((d) => [d.id, d]));

  for (const alloc of allocations) {
    const doc = docMap.get(alloc.documentId);
    if (!doc || doc.status === "cancelled" || Number(doc.partyId) !== Number(partyId)) {
      return { ok: false, formError: "allocationDocumentInvalid" };
    }
    if (alloc.amount > Number(doc.dueAmount) + 0.004) {
      return { ok: false, formError: "allocationExceedsDue" };
    }
  }

  return { ok: true, documentType };
}

export async function listPartiesForPicker(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  // No party_type filter — mirrors legacy load_payment_parties() exactly,
  // which lists every party for both Payment In and Payment Out pickers.
  return db.select({ id: parties.id, name: parties.name, type: parties.type }).from(parties).orderBy(asc(parties.name));
}

export async function listActiveBankAccountsForPicker(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  const rows = await db
    .select({
      id: bankAccounts.id,
      displayName: bankAccounts.displayName,
      bankName: bankAccounts.bankName,
      accountNumber: bankAccounts.accountNumber,
    })
    .from(bankAccounts)
    .where(eq(bankAccounts.status, "active"))
    .orderBy(asc(bankAccounts.bankName), asc(bankAccounts.displayName));
  return rows.map((row) => ({
    ...row,
    label: `${row.bankName}${row.displayName ? ` — ${row.displayName}` : ""}${row.accountNumber ? ` (${row.accountNumber})` : ""}`,
  }));
}

export async function listPaymentsAction(companySlug, paymentType, { from, to } = {}) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);

  const conditions = [eq(payments.paymentType, paymentType)];
  if (from) conditions.push(gte(payments.paymentDate, from));
  if (to) conditions.push(lte(payments.paymentDate, to));

  const rows = await db
    .select({
      id: payments.id,
      paymentDate: payments.paymentDate,
      receiptNumber: payments.receiptNumber,
      amount: payments.amount,
      notes: payments.notes,
      partyId: payments.partyId,
      bankAccountId: payments.bankAccountId,
      partyName: parties.name,
      bankName: bankAccounts.bankName,
      bankDisplayName: bankAccounts.displayName,
    })
    .from(payments)
    .leftJoin(parties, eq(parties.id, payments.partyId))
    .leftJoin(bankAccounts, eq(bankAccounts.id, payments.bankAccountId))
    .where(and(...conditions))
    .orderBy(desc(payments.id));

  return rows.map((row) => ({
    ...row,
    amount: Number(row.amount),
    bankLabel: row.bankDisplayName ? `${row.bankName} — ${row.bankDisplayName}` : row.bankName,
  }));
}

export async function getPaymentForEditAction(companySlug, paymentType, paymentId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, Number(paymentId)), eq(payments.paymentType, paymentType)))
    .limit(1);
  if (!payment) return null;

  const allocations = await db.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, payment.id));

  const isSales = paymentType === "in";
  const table = isSales ? salesInvoices : purchaseBills;
  const numberCol = isSales ? table.invoiceNumber : table.billNumber;
  const docIds = allocations.map((a) => a.documentId);
  const docs = docIds.length
    ? await db.select({ id: table.id, documentNo: numberCol }).from(table).where(inArray(table.id, docIds))
    : [];
  const docMap = new Map(docs.map((d) => [d.id, d.documentNo]));

  return {
    ...payment,
    amount: Number(payment.amount),
    allocations: allocations.map((a) => ({
      documentId: a.documentId,
      amount: Number(a.allocatedAmount),
      documentNo: docMap.get(a.documentId) ?? "",
    })),
  };
}

export async function createPaymentAction(companySlug, paymentType, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return { ok: false, fieldErrors: {}, formError: "notAllowed" };

  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;
  const partyId = data.partyId || null;

  if (data.allocations.length > 0 && !partyId) {
    return { ok: false, formError: "partyRequiredForAllocation" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);

  const validation = await validateAllocations(db, paymentType, partyId, data.amount, data.allocations);
  if (!validation.ok) return { ok: false, formError: validation.formError };

  const receiptNumber = await nextReceiptNumber(db, paymentType);

  const [{ id: paymentId }] = await db
    .insert(payments)
    .values({
      paymentType,
      paymentDate: data.paymentDate,
      receiptNumber,
      partyId,
      bankAccountId: data.bankAccountId,
      amount: data.amount.toFixed(2),
      notes: data.notes || null,
    })
    .$returningId();

  // Every payment posts into the bank ledger immediately — no deferral by
  // payment method (there is no such column) — see file header note.
  await db.insert(bankTransactions).values({
    bankAccountId: data.bankAccountId,
    txnDate: data.paymentDate,
    txnType: paymentType === "in" ? "credit" : "debit",
    transactionType: txnTypeNameFor(paymentType),
    transactionRefId: paymentId,
    amount: data.amount.toFixed(2),
    referenceNo: receiptNumber,
    note: data.notes || null,
  });

  const affectedDocs = new Set();
  for (const alloc of data.allocations) {
    if (alloc.amount <= 0) continue;
    await db.insert(paymentAllocations).values({
      paymentId,
      documentType: validation.documentType,
      documentId: alloc.documentId,
      allocatedAmount: round2(alloc.amount).toFixed(2),
    });
    affectedDocs.add(alloc.documentId);
  }
  for (const docId of affectedDocs) {
    await syncDocumentDueAmount(db, validation.documentType, docId);
  }

  if (partyId) {
    await recalculatePartyBalance(db, partyId);
  }

  revalidateFinancePaths(companySlug, paymentType, data.bankAccountId);
  return { ok: true, message: paymentType === "in" ? "paymentInCreated" : "paymentOutCreated", id: paymentId };
}

export async function updatePaymentAction(companySlug, paymentType, paymentId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return { ok: false, fieldErrors: {}, formError: "notAllowed" };

  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;
  const partyId = data.partyId || null;
  const id = Number(paymentId);

  const db = getOrganizationDb(context.session.organizationDbName);

  const [old] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, id), eq(payments.paymentType, paymentType)))
    .limit(1);
  if (!old) return { ok: false, fieldErrors: {}, formError: "paymentNotFound" };

  if (data.allocations.length > 0 && !partyId) {
    return { ok: false, formError: "partyRequiredForAllocation" };
  }

  // Reverse this payment's existing allocations first (mirrors legacy's
  // reverse_payment_allocations before re-applying) so the fresh dueAmount
  // read below already excludes this payment's own old contribution —
  // no reservation math needed here, only in the read-only picker above.
  const oldAllocations = await db.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, id));
  await db.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, id));
  const reversedDocs = new Map();
  for (const alloc of oldAllocations) {
    if (!reversedDocs.has(alloc.documentType)) reversedDocs.set(alloc.documentType, new Set());
    reversedDocs.get(alloc.documentType).add(alloc.documentId);
  }
  for (const [docType, ids] of reversedDocs) {
    for (const docId of ids) await syncDocumentDueAmount(db, docType, docId);
  }

  const validation = await validateAllocations(db, paymentType, partyId, data.amount, data.allocations);
  if (!validation.ok) return { ok: false, formError: validation.formError };

  await db
    .update(payments)
    .set({
      paymentDate: data.paymentDate,
      partyId,
      bankAccountId: data.bankAccountId,
      amount: data.amount.toFixed(2),
      notes: data.notes || null,
    })
    .where(eq(payments.id, id));

  const txnTypeName = txnTypeNameFor(paymentType);
  await db
    .delete(bankTransactions)
    .where(and(eq(bankTransactions.transactionType, txnTypeName), eq(bankTransactions.transactionRefId, id)));
  await db.insert(bankTransactions).values({
    bankAccountId: data.bankAccountId,
    txnDate: data.paymentDate,
    txnType: paymentType === "in" ? "credit" : "debit",
    transactionType: txnTypeName,
    transactionRefId: id,
    amount: data.amount.toFixed(2),
    referenceNo: old.receiptNumber,
    note: data.notes || null,
  });

  const newAffected = new Set();
  for (const alloc of data.allocations) {
    if (alloc.amount <= 0) continue;
    await db.insert(paymentAllocations).values({
      paymentId: id,
      documentType: validation.documentType,
      documentId: alloc.documentId,
      allocatedAmount: round2(alloc.amount).toFixed(2),
    });
    newAffected.add(alloc.documentId);
  }
  for (const docId of newAffected) {
    await syncDocumentDueAmount(db, validation.documentType, docId);
  }

  if (partyId) await recalculatePartyBalance(db, partyId);
  if (old.partyId && Number(old.partyId) !== Number(partyId ?? 0)) {
    await recalculatePartyBalance(db, old.partyId);
  }

  revalidateFinancePaths(companySlug, paymentType, [old.bankAccountId, data.bankAccountId]);
  return { ok: true, message: paymentType === "in" ? "paymentInUpdated" : "paymentOutUpdated" };
}

export async function deletePaymentAction(companySlug, paymentType, paymentIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return { ok: false, formError: "notAllowed" };

  const ids = (Array.isArray(paymentIds) ? paymentIds : [paymentIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) return { ok: false, formError: "paymentNotFound" };

  const db = getOrganizationDb(context.session.organizationDbName);
  const txnTypeName = txnTypeNameFor(paymentType);

  const rows = await db
    .select()
    .from(payments)
    .where(and(inArray(payments.id, ids), eq(payments.paymentType, paymentType)));

  const partyIds = new Set();
  const bankAccountIds = new Set();

  for (const row of rows) {
    const allocations = await db.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, row.id));
    await db.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, row.id));
    for (const alloc of allocations) {
      await syncDocumentDueAmount(db, alloc.documentType, alloc.documentId);
    }
    await db
      .delete(bankTransactions)
      .where(and(eq(bankTransactions.transactionType, txnTypeName), eq(bankTransactions.transactionRefId, row.id)));
    await db.delete(payments).where(eq(payments.id, row.id));

    if (row.partyId) partyIds.add(row.partyId);
    bankAccountIds.add(row.bankAccountId);
  }

  for (const partyId of partyIds) {
    await recalculatePartyBalance(db, partyId);
  }

  revalidateFinancePaths(companySlug, paymentType, [...bankAccountIds]);
  return { ok: true, message: paymentType === "in" ? "paymentInDeleted" : "paymentOutDeleted", count: rows.length };
}
