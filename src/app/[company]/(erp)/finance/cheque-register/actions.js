"use server";

import { asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { bankAccounts, chequeRegister, parties } from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { round2 } from "@/lib/money";

/**
 * Ported from legacy models/Cheque.php (verified in full). Two findings
 * that matter for fidelity, since this module wasn't pre-verified before
 * this build wave:
 * - The Cheque Register is a fully STANDALONE tracker — it is never
 *   auto-created from a Payment, and it has no FK/reference to `payments`
 *   at all. There's no "payment method" concept linking the two.
 * - Status transitions (pending -> cleared/bounced/cancelled) touch ONLY
 *   `cheque_register` itself — legacy's update_cheque_status() never
 *   inserts/deletes a bank_transactions row. The bank ledger is not
 *   automatically updated when a cheque clears; recording the actual money
 *   movement (e.g. via Payment In/Out) is left to the user, same as legacy.
 *   Don't "improve" this by wiring an automatic bank posting — it would be
 *   a behavior change beyond what legacy does.
 * - `reminderDate` is NOT a user-entered field — it's always auto-derived
 *   as `chequeDate - 1 day` (cheque_reminder_date()), recomputed whenever
 *   chequeDate changes.
 * - Sort order on the list: pending first, then bounced, then cleared, then
 *   cancelled (FIELD() ordering), then by chequeDate ascending within each
 *   status group.
 */

function canAccessFinance(context) {
  return context.accessibleModules.includes("finance");
}

const STATUS_ORDER = { pending: 0, bounced: 1, cleared: 2, cancelled: 3 };

function reminderDateFor(chequeDate) {
  const d = new Date(`${chequeDate}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

const chequeSchema = z.object({
  chequeType: z.enum(["received", "issued"]).default("received"),
  chequeNumber: z.string().trim().min(1, "chequeNumberRequired").max(80),
  chequeDate: z.string().trim().min(1, "chequeDateRequired"),
  partyId: z.coerce.number().int().min(0).default(0),
  bankAccountId: z.coerce.number().int().min(0).default(0),
  bankName: z.string().trim().max(180).optional().or(z.literal("")),
  amount: z.coerce.number().positive("amountRequired"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function listPartiesForCheques(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db.select({ id: parties.id, name: parties.name }).from(parties).orderBy(asc(parties.name));
}

export async function listBankAccountsForCheques(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  const rows = await db
    .select({ id: bankAccounts.id, displayName: bankAccounts.displayName, bankName: bankAccounts.bankName })
    .from(bankAccounts)
    .where(eq(bankAccounts.status, "active"))
    .orderBy(asc(bankAccounts.bankName));
  return rows.map((row) => ({ ...row, label: row.displayName ? `${row.bankName} — ${row.displayName}` : row.bankName }));
}

export async function listCheques(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);

  const rows = await db
    .select({
      id: chequeRegister.id,
      chequeType: chequeRegister.chequeType,
      chequeNumber: chequeRegister.chequeNumber,
      chequeDate: chequeRegister.chequeDate,
      reminderDate: chequeRegister.reminderDate,
      partyId: chequeRegister.partyId,
      partyName: parties.name,
      bankAccountId: chequeRegister.bankAccountId,
      bankAccountLabel: bankAccounts.displayName,
      bankAccountName: bankAccounts.bankName,
      bankName: chequeRegister.bankName,
      amount: chequeRegister.amount,
      status: chequeRegister.status,
      clearedDate: chequeRegister.clearedDate,
      notes: chequeRegister.notes,
    })
    .from(chequeRegister)
    .leftJoin(parties, eq(chequeRegister.partyId, parties.id))
    .leftJoin(bankAccounts, eq(chequeRegister.bankAccountId, bankAccounts.id));

  return rows
    .map((row) => ({
      ...row,
      amount: Number(row.amount),
      bankLabel: row.bankAccountName ? (row.bankAccountLabel ? `${row.bankAccountName} — ${row.bankAccountLabel}` : row.bankAccountName) : row.bankName,
    }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.chequeDate.localeCompare(b.chequeDate));
}

export async function createChequeAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return { ok: false, fieldErrors: {}, formError: "notAllowed" };

  const parsed = chequeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  await db.insert(chequeRegister).values({
    chequeType: data.chequeType,
    chequeNumber: data.chequeNumber,
    chequeDate: data.chequeDate,
    reminderDate: reminderDateFor(data.chequeDate),
    partyId: data.partyId || null,
    bankAccountId: data.bankAccountId || null,
    bankName: data.bankName || null,
    amount: round2(data.amount).toFixed(2),
    status: "pending",
    notes: data.notes || null,
  });

  revalidatePath(`/${companySlug}/finance/cheque-register`);
  return { ok: true, message: "chequeCreated" };
}

export async function updateChequeAction(companySlug, chequeId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return { ok: false, fieldErrors: {}, formError: "notAllowed" };

  const parsed = chequeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;
  const id = Number(chequeId);
  const db = getOrganizationDb(context.session.organizationDbName);

  await db
    .update(chequeRegister)
    .set({
      chequeType: data.chequeType,
      chequeNumber: data.chequeNumber,
      chequeDate: data.chequeDate,
      reminderDate: reminderDateFor(data.chequeDate),
      partyId: data.partyId || null,
      bankAccountId: data.bankAccountId || null,
      bankName: data.bankName || null,
      amount: round2(data.amount).toFixed(2),
      notes: data.notes || null,
    })
    .where(eq(chequeRegister.id, id));

  revalidatePath(`/${companySlug}/finance/cheque-register`);
  return { ok: true, message: "chequeUpdated" };
}

// Mirrors legacy update_cheque_status(): only touches cheque_register —
// clearedDate auto-set to today when moving to "cleared" (unless the
// caller passes one explicitly), null for every other status. No
// bank_transactions effect — see this file's header comment.
export async function updateChequeStatusAction(companySlug, chequeId, status, clearedDate) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return { ok: false, formError: "notAllowed" };
  if (!["pending", "cleared", "bounced", "cancelled"].includes(status)) {
    return { ok: false, formError: "somethingWentWrong" };
  }

  const id = Number(chequeId);
  const db = getOrganizationDb(context.session.organizationDbName);

  const resolvedClearedDate = clearedDate || (status === "cleared" ? new Date().toISOString().slice(0, 10) : null);

  await db.update(chequeRegister).set({ status, clearedDate: resolvedClearedDate }).where(eq(chequeRegister.id, id));

  revalidatePath(`/${companySlug}/finance/cheque-register`);
  return { ok: true, message: "chequeStatusUpdated" };
}

export async function deleteChequesAction(companySlug, chequeIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return { ok: false, formError: "notAllowed" };

  const ids = (Array.isArray(chequeIds) ? chequeIds : [chequeIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) return { ok: false, formError: "chequeNotFound" };

  const db = getOrganizationDb(context.session.organizationDbName);
  await db.delete(chequeRegister).where(inArray(chequeRegister.id, ids));

  revalidatePath(`/${companySlug}/finance/cheque-register`);
  return { ok: true, message: "chequesDeleted", count: ids.length };
}

// Small dashboard-style counts widget for the list header — mirrors
// legacy's get_cheque_attention_counts().
export async function getChequeAttentionCounts(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return { pendingCount: 0, overdueCount: 0, pendingAmount: 0 };
  const db = getOrganizationDb(context.session.organizationDbName);
  const today = new Date().toISOString().slice(0, 10);

  const [row] = await db
    .select({
      pendingCount: sql`SUM(CASE WHEN ${chequeRegister.status} = 'pending' THEN 1 ELSE 0 END)`,
      overdueCount: sql`SUM(CASE WHEN ${chequeRegister.status} = 'pending' AND ${chequeRegister.chequeDate} < ${today} THEN 1 ELSE 0 END)`,
      pendingAmount: sql`COALESCE(SUM(CASE WHEN ${chequeRegister.status} = 'pending' THEN ${chequeRegister.amount} ELSE 0 END), 0)`,
    })
    .from(chequeRegister);

  return {
    pendingCount: Number(row?.pendingCount ?? 0),
    overdueCount: Number(row?.overdueCount ?? 0),
    pendingAmount: Number(row?.pendingAmount ?? 0),
  };
}
