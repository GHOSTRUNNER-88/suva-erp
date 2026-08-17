"use server";

import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { bankAccounts, bankTransactions, expenseCategories, expenses, parties } from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { nextSequenceValue } from "@/lib/document-numbering";
import { round2 } from "@/lib/money";
import { recalculatePartyBalance } from "@/lib/party-ledger";
import { z } from "zod";

/**
 * Ported from legacy `expenses` (APP-REPORT.md §7.6), verified against the
 * actual model file (models/Expense.php's create_expense()/update_expense()/
 * delete_expense()), not just the schema summary — see @/../AGENTS.md §6 on
 * why that distinction matters. Full rule set, all verified:
 *
 * - `voucherNumber` is ALWAYS server-assigned (MAX(id)+1 via
 *   lib/document-numbering.js's nextSequenceValue) — never accepted from the
 *   client, never editable after creation. `expenseNumber` is user-editable
 *   free text, uniqueness scoped PER PARTY (or globally among party-less
 *   expenses) — enforced here at the application layer, no DB constraint
 *   exists for it (see expenseNumberExists below).
 * - `subtotal` mirrors `taxableAmount` exactly (NOT taxable+nonTaxable).
 *   VAT is computed on `taxableAmount` ONLY. Grand total `amount` =
 *   taxableAmount + nonTaxableAmount + vatAmount, all round2'd per stage
 *   (lib/money.js, reused here for its rounding rule only — expenses have
 *   no line items so calcLineTotal/calcDocumentTotals don't apply).
 * - VAT is force-disabled server-side (client's isVatApplicable/vatAmount
 *   are never trusted) when the selected category's name is "Salary"
 *   (case-insensitive) OR when taxableAmount <= 0 — see resolveVat below.
 *   This mirrors this app's existing VAT force-disable convention
 *   documented in @/../AGENTS.md §6.
 * - Bank posting: only when bankAccountId is set AND amount > 0, a single
 *   `bank_transactions` debit row is inserted directly (txnType: "debit",
 *   transactionType: "expense", transactionRefId: the expense id) — an
 *   expense with no bank account is recorded but never touches the bank
 *   ledger (e.g. a payable expense to settle later). On edit, the old row
 *   is deleted and a fresh one re-inserted per the same rule (correctly
 *   handles the bank account/amount changing or being cleared).
 * - Party ledger: if partyId is set, recalculatePartyBalance is called
 *   regardless of whether a bank transaction was ALSO created — a known
 *   legacy quirk (an expense can simultaneously reduce the bank balance AND
 *   increase what we owe the party if both fields are set), ported exactly,
 *   not reconciled. See lib/party-ledger.js for the sign convention.
 * - Deleting hard-deletes the expense row (unlike invoices/bills, legacy
 *   never soft-cancels an expense — verified against delete_expense()),
 *   plus its bank_transactions row, then recalculates the party balance.
 * - `status` always ends up 'completed' (schema default) — legacy's
 *   create_expense() always inserts status 'completed' and there's no
 *   separate cancel-workflow for expenses specifically, so this module
 *   never writes any other status.
 */

// Empty-string/undefined/null all normalize to null for an optional foreign
// key select (CreatableSelect's "not selected" state is ""), then a real id
// still has to be a positive integer. Plain `z.coerce.number()...nullable()`
// (the pattern used elsewhere in this app, e.g. items/actions.js's
// categoryId) does NOT do this safely: z.coerce.number() coerces "" to 0
// before `.nullable()` ever gets a chance to see the empty string, and 0
// then fails `.positive()` — verified directly against this project's
// installed zod (v4) rather than assumed. This wrapper avoids that footgun.
const optionalId = () =>
  z.preprocess((value) => (value === "" || value == null ? null : value), z.coerce.number().int().positive().nullable());

const expenseSchema = z.object({
  expenseNumber: z.string().trim().min(1, "expenseNumberRequired").max(50, "expenseNumberTooLong"),
  expenseDate: z.string().trim().min(1, "expenseDateRequired"),
  categoryId: optionalId(),
  partyId: optionalId(),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  taxableAmount: z.coerce.number().min(0, "somethingWentWrong").default(0),
  nonTaxableAmount: z.coerce.number().min(0, "somethingWentWrong").default(0),
  vatPercent: z.coerce.number().min(0, "somethingWentWrong").max(100, "somethingWentWrong").default(0),
  isVatApplicable: z.boolean().default(false),
  bankAccountId: optionalId(),
  referenceNo: z.string().trim().max(100).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

function canAccessPurchase(context) {
  return context.accessibleModules.includes("purchase");
}

async function expenseNumberExists(db, partyId, expenseNumber, exceptId) {
  const partyCondition = partyId ? eq(expenses.partyId, partyId) : isNull(expenses.partyId);
  const where = exceptId
    ? and(partyCondition, eq(expenses.expenseNumber, expenseNumber), ne(expenses.id, exceptId))
    : and(partyCondition, eq(expenses.expenseNumber, expenseNumber));
  const existing = await db.select({ id: expenses.id }).from(expenses).where(where).limit(1);
  return existing.length > 0;
}

// Server-side VAT force-disable — see the block comment above. Runs
// regardless of what the client posted for isVatApplicable/vatPercent.
async function resolveVat(db, { categoryId, taxableAmount, isVatApplicable, vatPercent }) {
  let applicable = isVatApplicable;
  if (taxableAmount <= 0) applicable = false;

  if (applicable && categoryId) {
    const [category] = await db
      .select({ name: expenseCategories.name })
      .from(expenseCategories)
      .where(eq(expenseCategories.id, categoryId))
      .limit(1);
    if (category && category.name.trim().toLowerCase() === "salary") applicable = false;
  }

  const appliedPercent = applicable ? vatPercent : 0;
  const vatAmount = applicable ? round2((taxableAmount * appliedPercent) / 100) : 0;
  return { isVatApplicable: applicable, vatPercent: applicable ? appliedPercent : null, vatAmount };
}

async function postExpenseBankTransaction(db, { expenseId, bankAccountId, amount, expenseDate, expenseNumber, description }) {
  if (!bankAccountId || amount <= 0) return;
  await db.insert(bankTransactions).values({
    bankAccountId,
    txnDate: expenseDate,
    txnType: "debit",
    transactionType: "expense",
    transactionRefId: expenseId,
    amount: amount.toFixed(2),
    referenceNo: expenseNumber,
    note: description || "Expense",
  });
}

async function deleteExpenseBankTransaction(db, expenseId) {
  await db
    .delete(bankTransactions)
    .where(and(eq(bankTransactions.transactionType, "expense"), eq(bankTransactions.transactionRefId, expenseId)));
}

export async function listExpenses(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({
      id: expenses.id,
      voucherNumber: expenses.voucherNumber,
      expenseNumber: expenses.expenseNumber,
      expenseDate: expenses.expenseDate,
      categoryId: expenses.categoryId,
      categoryName: expenseCategories.name,
      partyId: expenses.partyId,
      partyName: parties.name,
      description: expenses.description,
      taxableAmount: expenses.taxableAmount,
      nonTaxableAmount: expenses.nonTaxableAmount,
      subtotal: expenses.subtotal,
      vatPercent: expenses.vatPercent,
      vatAmount: expenses.vatAmount,
      isVatApplicable: expenses.isVatApplicable,
      amount: expenses.amount,
      bankAccountId: expenses.bankAccountId,
      bankAccountName: bankAccounts.bankName,
      referenceNo: expenses.referenceNo,
      notes: expenses.notes,
      status: expenses.status,
      createdAt: expenses.createdAt,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .leftJoin(parties, eq(expenses.partyId, parties.id))
    .leftJoin(bankAccounts, eq(expenses.bankAccountId, bankAccounts.id))
    .orderBy(desc(expenses.id));
}

export async function getExpenseDetail(companySlug, expenseId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const [expense] = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, Number(expenseId)))
    .limit(1);
  return expense ?? null;
}

// Lightweight option lists for the Expense form's pickers — queried
// directly against the parties/bankAccounts tables this module "joins
// against" (see @/db/schema/organization.js), rather than importing those
// modules' own actions.js, keeping this module self-contained.
export async function listPartyOptions(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db.select({ id: parties.id, name: parties.name }).from(parties).orderBy(asc(parties.name));
}

export async function listBankAccountOptions(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({ id: bankAccounts.id, bankName: bankAccounts.bankName, displayName: bankAccounts.displayName })
    .from(bankAccounts)
    .where(eq(bankAccounts.status, "active"))
    .orderBy(asc(bankAccounts.bankName));
}

export async function createExpenseAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  if (await expenseNumberExists(db, data.partyId, data.expenseNumber)) {
    return { ok: false, fieldErrors: { expenseNumber: ["expenseNumberExists"] } };
  }

  const { isVatApplicable, vatPercent, vatAmount } = await resolveVat(db, {
    categoryId: data.categoryId,
    taxableAmount: data.taxableAmount,
    isVatApplicable: data.isVatApplicable,
    vatPercent: data.vatPercent,
  });

  const subtotal = round2(data.taxableAmount);
  const amount = round2(data.taxableAmount + data.nonTaxableAmount + vatAmount);
  const voucherNumber = await nextSequenceValue(db, expenses, expenses.id);

  const [{ id: expenseId }] = await db
    .insert(expenses)
    .values({
      voucherNumber,
      expenseNumber: data.expenseNumber,
      expenseDate: data.expenseDate,
      categoryId: data.categoryId,
      partyId: data.partyId,
      description: data.description || null,
      taxableAmount: data.taxableAmount.toFixed(5),
      nonTaxableAmount: data.nonTaxableAmount.toFixed(5),
      subtotal: subtotal.toFixed(2),
      vatPercent: vatPercent != null ? vatPercent.toFixed(2) : null,
      vatAmount: vatAmount.toFixed(2),
      isVatApplicable: isVatApplicable ? 1 : 0,
      amount: amount.toFixed(2),
      bankAccountId: data.bankAccountId,
      referenceNo: data.referenceNo || null,
      notes: data.notes || null,
    })
    .$returningId();

  await postExpenseBankTransaction(db, {
    expenseId,
    bankAccountId: data.bankAccountId,
    amount,
    expenseDate: data.expenseDate,
    expenseNumber: data.expenseNumber,
    description: data.description,
  });

  if (data.partyId) await recalculatePartyBalance(db, data.partyId);

  revalidatePath(`/${companySlug}/purchase/expenses`);
  return { ok: true, message: "expenseCreated" };
}

export async function updateExpenseAction(companySlug, expenseId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(expenseId);
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db
    .select({ id: expenses.id, partyId: expenses.partyId })
    .from(expenses)
    .where(eq(expenses.id, id))
    .limit(1);
  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "expenseNotFound" };
  }
  if (await expenseNumberExists(db, data.partyId, data.expenseNumber, id)) {
    return { ok: false, fieldErrors: { expenseNumber: ["expenseNumberExists"] } };
  }

  const { isVatApplicable, vatPercent, vatAmount } = await resolveVat(db, {
    categoryId: data.categoryId,
    taxableAmount: data.taxableAmount,
    isVatApplicable: data.isVatApplicable,
    vatPercent: data.vatPercent,
  });

  const subtotal = round2(data.taxableAmount);
  const amount = round2(data.taxableAmount + data.nonTaxableAmount + vatAmount);

  await db
    .update(expenses)
    .set({
      expenseNumber: data.expenseNumber,
      expenseDate: data.expenseDate,
      categoryId: data.categoryId,
      partyId: data.partyId,
      description: data.description || null,
      taxableAmount: data.taxableAmount.toFixed(5),
      nonTaxableAmount: data.nonTaxableAmount.toFixed(5),
      subtotal: subtotal.toFixed(2),
      vatPercent: vatPercent != null ? vatPercent.toFixed(2) : null,
      vatAmount: vatAmount.toFixed(2),
      isVatApplicable: isVatApplicable ? 1 : 0,
      amount: amount.toFixed(2),
      bankAccountId: data.bankAccountId,
      referenceNo: data.referenceNo || null,
      notes: data.notes || null,
    })
    .where(eq(expenses.id, id));

  // Full delete + reinsert of this expense's bank_transactions row —
  // correctly handles the bank account/amount being changed or cleared.
  await deleteExpenseBankTransaction(db, id);
  await postExpenseBankTransaction(db, {
    expenseId: id,
    bankAccountId: data.bankAccountId,
    amount,
    expenseDate: data.expenseDate,
    expenseNumber: data.expenseNumber,
    description: data.description,
  });

  // Recalculate both the old and new party (a known legacy quirk: an
  // expense can post to the party ledger AND the bank ledger at the same
  // time if both fields are set — see @/../AGENTS.md §6, ported exactly,
  // not reconciled). recalculatePartyBalance no-ops safely for a null id.
  if (existing.partyId) await recalculatePartyBalance(db, existing.partyId);
  if (data.partyId && data.partyId !== existing.partyId) await recalculatePartyBalance(db, data.partyId);

  revalidatePath(`/${companySlug}/purchase/expenses`);
  return { ok: true, message: "expenseUpdated" };
}

export async function deleteExpensesAction(companySlug, expenseIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const ids = (Array.isArray(expenseIds) ? expenseIds : [expenseIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) {
    return { ok: false, formError: "expenseNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  const toDelete = await db
    .select({ id: expenses.id, partyId: expenses.partyId })
    .from(expenses)
    .where(inArray(expenses.id, ids));

  // Matches legacy delete_expense(): hard delete (unlike invoices/bills,
  // expenses have no cancel workflow — see @/../AGENTS.md §6), plus its
  // bank_transactions row.
  await db
    .delete(bankTransactions)
    .where(and(eq(bankTransactions.transactionType, "expense"), inArray(bankTransactions.transactionRefId, ids)));
  await db.delete(expenses).where(inArray(expenses.id, ids));

  const partyIds = [...new Set(toDelete.map((row) => row.partyId).filter(Boolean))];
  await Promise.all(partyIds.map((partyId) => recalculatePartyBalance(db, partyId)));

  revalidatePath(`/${companySlug}/purchase/expenses`);
  return { ok: true, message: "expensesDeleted", count: ids.length };
}
