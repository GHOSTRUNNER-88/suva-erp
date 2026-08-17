"use server";

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { bankAccounts, bankTransactions } from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { z } from "zod";

/**
 * Ported from legacy models/BankAccount.php + BankTransaction.php +
 * admin/bank-accounts.php (APP-REPORT.md §7.5) — same fields, same opening-
 * balance-as-a-ledger-row behavior, same transfer pairing. See
 * ../../../db/schema/organization.js for the two tables this reads/writes.
 * QR code upload uses this server's own filesystem (public/uploads/), not
 * Firebase Storage — see uploadBankQrCodeAction below.
 */
const bankAccountSchema = z
  .object({
    displayName: z.string().trim().max(150).optional().or(z.literal("")),
    bankName: z.string().trim().min(1, "bankNameRequired").max(150, "bankNameTooLong"),
    openingBalance: z.coerce.number().min(0, "somethingWentWrong").default(0),
    asOfDate: z.string().trim().min(1, "asOfDateRequired"),
    printOnInvoice: z.boolean().default(false),
    accountNumber: z.string().trim().max(100).optional().or(z.literal("")),
    accountHolderName: z.string().trim().max(150).optional().or(z.literal("")),
    branch: z.string().trim().max(150).optional().or(z.literal("")),
    qrCodeUrl: z.string().trim().max(500).optional().or(z.literal("")),
    status: z.enum(["active", "inactive"]).default("active"),
  })
  .superRefine((data, ctx) => {
    if (!data.printOnInvoice) return;
    if (!data.accountNumber) {
      ctx.addIssue({ path: ["accountNumber"], code: z.ZodIssueCode.custom, message: "accountNumberRequiredForInvoice" });
    }
    if (!data.accountHolderName) {
      ctx.addIssue({ path: ["accountHolderName"], code: z.ZodIssueCode.custom, message: "accountHolderNameRequiredForInvoice" });
    }
    if (!data.branch) {
      ctx.addIssue({ path: ["branch"], code: z.ZodIssueCode.custom, message: "branchRequiredForInvoice" });
    }
  });

const transferSchema = z
  .object({
    fromAccountId: z.coerce.number().int().positive("fromAccountRequired"),
    toAccountId: z.coerce.number().int().positive("toAccountRequired"),
    amount: z.coerce.number().positive("transferAmountRequired"),
    transferDate: z.string().trim().min(1, "transferDateRequired"),
    note: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((data) => data.fromAccountId !== data.toAccountId, {
    path: ["toAccountId"],
    message: "transferAccountsMustDiffer",
  });

const editTransferSchema = z.object({
  amount: z.coerce.number().positive("transferAmountRequired"),
  transferDate: z.string().trim().min(1, "transferDateRequired"),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

const MAX_QR_BYTES = 2 * 1024 * 1024;
const QR_MIME_EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const QR_UPLOAD_URL_PREFIX = "/uploads/qr-codes/";

function canAccessCashBank(context) {
  return context.accessibleModules.includes("cashBank");
}

function accountLabel(account) {
  return account.displayName ? `${account.bankName} (${account.displayName})` : account.bankName;
}

/**
 * balance = Σcredit − Σdebit over the full ledger — the one formula this
 * whole module (and eventually the dashboard/balance sheet) must share, per
 * ../../../AGENTS.md §6. `asOfDate` inclusive (<=), mirroring legacy's
 * get_bank_account_balance(). Takes a `db` handle (not companySlug) so
 * other server code can reuse it directly without repeating the session/
 * auth ceremony.
 */
export async function getBankAccountBalance(db, bankAccountId, asOfDate) {
  const conditions = [eq(bankTransactions.bankAccountId, bankAccountId)];
  if (asOfDate) conditions.push(lte(bankTransactions.txnDate, asOfDate));
  const [row] = await db
    .select({
      credit: sql`COALESCE(SUM(CASE WHEN ${bankTransactions.txnType} = 'credit' THEN ${bankTransactions.amount} ELSE 0 END), 0)`,
      debit: sql`COALESCE(SUM(CASE WHEN ${bankTransactions.txnType} = 'debit' THEN ${bankTransactions.amount} ELSE 0 END), 0)`,
    })
    .from(bankTransactions)
    .where(and(...conditions));
  return Number(row?.credit ?? 0) - Number(row?.debit ?? 0);
}

// Same formula as getBankAccountBalance, strictly-before instead of
// inclusive — mirrors legacy's separate get_balance_before_date(), used to
// show "Opening Balance (before <filter start>)" once a from-date filter is
// applied to the transactions list.
export async function getBankAccountBalanceBefore(db, bankAccountId, date) {
  const [row] = await db
    .select({
      credit: sql`COALESCE(SUM(CASE WHEN ${bankTransactions.txnType} = 'credit' THEN ${bankTransactions.amount} ELSE 0 END), 0)`,
      debit: sql`COALESCE(SUM(CASE WHEN ${bankTransactions.txnType} = 'debit' THEN ${bankTransactions.amount} ELSE 0 END), 0)`,
    })
    .from(bankTransactions)
    .where(and(eq(bankTransactions.bankAccountId, bankAccountId), lt(bankTransactions.txnDate, date)));
  return Number(row?.credit ?? 0) - Number(row?.debit ?? 0);
}

// Same Σcredit−Σdebit formula as getBankAccountBalance, batched via
// LEFT JOIN + GROUP BY (mirrors legacy's get_bank_accounts_with_balance())
// instead of one query per account, since this powers the full list page.
export async function listBankAccountsWithBalance(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessCashBank(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  const rows = await db
    .select({
      id: bankAccounts.id,
      displayName: bankAccounts.displayName,
      bankName: bankAccounts.bankName,
      status: bankAccounts.status,
      printOnInvoice: bankAccounts.printOnInvoice,
      currentBalance: sql`COALESCE(SUM(CASE WHEN ${bankTransactions.txnType} = 'credit' THEN ${bankTransactions.amount} WHEN ${bankTransactions.txnType} = 'debit' THEN -${bankTransactions.amount} ELSE 0 END), 0)`,
    })
    .from(bankAccounts)
    .leftJoin(bankTransactions, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .groupBy(bankAccounts.id)
    .orderBy(desc(bankAccounts.id));
  return rows.map((row) => ({ ...row, currentBalance: Number(row.currentBalance) }));
}

export async function getBankAccountDetail(companySlug, bankAccountId) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessCashBank(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const [account] = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.id, Number(bankAccountId)))
    .limit(1);
  return account ?? null;
}

/**
 * Bank account header + its transaction ledger, optionally date-filtered —
 * mirrors legacy's bank-accounts.php page data (get_bank_account_by_id +
 * get_bank_account_balance + get_bank_transactions_by_account +
 * get_balance_before_date, all assembled together). totalCredit/totalDebit
 * are summed here from the already-fetched (filtered) transactions, same as
 * legacy's PHP loop — not a separate aggregate query.
 */
export async function getBankAccountLedger(companySlug, bankAccountId, { from, to } = {}) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessCashBank(context)) return null;
  const db = getOrganizationDb(context.session.organizationDbName);
  const id = Number(bankAccountId);

  const [account] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, id)).limit(1);
  if (!account) return null;

  const conditions = [eq(bankTransactions.bankAccountId, id)];
  if (from) conditions.push(gte(bankTransactions.txnDate, from));
  if (to) conditions.push(lte(bankTransactions.txnDate, to));

  const [transactionsAsc, currentBalance, openingBalanceBeforeFilter] = await Promise.all([
    db
      .select()
      .from(bankTransactions)
      .where(and(...conditions))
      .orderBy(asc(bankTransactions.txnDate), asc(bankTransactions.id)),
    getBankAccountBalance(db, id),
    from ? getBankAccountBalanceBefore(db, id, from) : Promise.resolve(null),
  ]);

  // Running balance only means anything walked in real chronological order,
  // seeded from the balance immediately before this filtered window (0 if
  // there's no `from` filter, since the fetched set already starts at the
  // account's very first transaction in that case). Computed here, ascending,
  // then reversed for display (newest first, matching legacy) — each row
  // keeps the balance value computed at its correct chronological position
  // regardless of the order it's shown in.
  let totalCredit = 0;
  let totalDebit = 0;
  let runningBalance = openingBalanceBeforeFilter ?? 0;
  const transactionsWithBalance = transactionsAsc.map((txn) => {
    const amount = Number(txn.amount);
    if (txn.txnType === "credit") {
      totalCredit += amount;
      runningBalance += amount;
    } else {
      totalDebit += amount;
      runningBalance -= amount;
    }
    return { ...txn, runningBalance };
  });
  const transactions = transactionsWithBalance.reverse();

  return { account, transactions, currentBalance, openingBalanceBeforeFilter, totalCredit, totalDebit };
}

// Given either leg's transaction id, resolves both linked rows plus the
// account labels needed to redisplay/re-derive the "Transfer to/from: X"
// note text — used to populate the Edit Transfer form.
async function resolveTransferPair(db, txnId) {
  const [txn] = await db.select().from(bankTransactions).where(eq(bankTransactions.id, txnId)).limit(1);
  if (!txn || txn.transactionType !== "transfer") return null;

  const pair = txn.transactionRefId
    ? (await db.select().from(bankTransactions).where(eq(bankTransactions.id, txn.transactionRefId)).limit(1))[0]
    : null;

  const debitTxn = txn.txnType === "debit" ? txn : pair;
  const creditTxn = txn.txnType === "credit" ? txn : pair;

  const [fromAccount, toAccount] = await Promise.all([
    debitTxn
      ? db
          .select({ id: bankAccounts.id, bankName: bankAccounts.bankName, displayName: bankAccounts.displayName })
          .from(bankAccounts)
          .where(eq(bankAccounts.id, debitTxn.bankAccountId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : null,
    creditTxn
      ? db
          .select({ id: bankAccounts.id, bankName: bankAccounts.bankName, displayName: bankAccounts.displayName })
          .from(bankAccounts)
          .where(eq(bankAccounts.id, creditTxn.bankAccountId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : null,
  ]);

  return { txn, debitTxn, creditTxn, fromAccount, toAccount };
}

function bankAccountValues(data) {
  return {
    displayName: data.displayName || null,
    bankName: data.bankName,
    openingBalance: data.openingBalance.toFixed(2),
    asOfDate: data.asOfDate,
    printOnInvoice: data.printOnInvoice ? 1 : 0,
    accountNumber: data.printOnInvoice ? data.accountNumber || null : null,
    accountHolderName: data.printOnInvoice ? data.accountHolderName || null : null,
    branch: data.printOnInvoice ? data.branch || null : null,
    qrCodeUrl: data.qrCodeUrl || null,
    status: data.status,
  };
}

// Full-replace sync of the ledger's single 'opening_balance' row — mirrors
// legacy's sync_opening_balance_transaction() exactly: create it if the
// amount is positive and none exists yet, update the existing one in place
// if the amount/date changed, or delete it if the amount is reset to 0.
async function syncOpeningBalanceTransaction(db, bankAccountId, amount, txnDate) {
  const [existing] = await db
    .select({ id: bankTransactions.id })
    .from(bankTransactions)
    .where(
      and(eq(bankTransactions.bankAccountId, bankAccountId), eq(bankTransactions.transactionType, "opening_balance"))
    )
    .limit(1);

  if (amount > 0) {
    if (existing) {
      await db
        .update(bankTransactions)
        .set({ amount: amount.toFixed(2), txnDate })
        .where(eq(bankTransactions.id, existing.id));
    } else {
      await db.insert(bankTransactions).values({
        bankAccountId,
        txnDate,
        txnType: "credit",
        transactionType: "opening_balance",
        transactionRefId: null,
        amount: amount.toFixed(2),
        referenceNo: "OPENING",
        note: "Opening balance",
      });
    }
    return;
  }

  if (existing) {
    await db.delete(bankTransactions).where(eq(bankTransactions.id, existing.id));
  }
}

async function deleteQrCodeFile(url) {
  if (!url || !url.startsWith(QR_UPLOAD_URL_PREFIX)) return;
  const filePath = path.join(process.cwd(), "public", url);
  await fs.unlink(filePath).catch(() => {});
}

export async function createBankAccountAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessCashBank(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = bankAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [{ id }] = await db.insert(bankAccounts).values(bankAccountValues(data)).$returningId();
  await syncOpeningBalanceTransaction(db, id, data.openingBalance, data.asOfDate);

  revalidatePath(`/${companySlug}/bank-accounts`);
  return { ok: true, message: "bankAccountCreated", id };
}

export async function updateBankAccountAction(companySlug, bankAccountId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessCashBank(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = bankAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(bankAccountId);
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db
    .select({ id: bankAccounts.id, qrCodeUrl: bankAccounts.qrCodeUrl })
    .from(bankAccounts)
    .where(eq(bankAccounts.id, id))
    .limit(1);
  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "bankAccountNotFound" };
  }

  await db.update(bankAccounts).set(bankAccountValues(data)).where(eq(bankAccounts.id, id));
  await syncOpeningBalanceTransaction(db, id, data.openingBalance, data.asOfDate);

  // uploadBankQrCodeAction always writes a fresh filename (never overwrites
  // in place), so a replaced QR would otherwise leak the old file on disk
  // forever — clean it up once the new one is safely saved.
  const newQrCodeUrl = data.qrCodeUrl || null;
  if (existing.qrCodeUrl && existing.qrCodeUrl !== newQrCodeUrl) {
    await deleteQrCodeFile(existing.qrCodeUrl);
  }

  revalidatePath(`/${companySlug}/bank-accounts`);
  revalidatePath(`/${companySlug}/bank-accounts/${id}`);
  return { ok: true, message: "bankAccountUpdated" };
}

export async function deleteBankAccountsAction(companySlug, bankAccountIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessCashBank(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const ids = (Array.isArray(bankAccountIds) ? bankAccountIds : [bankAccountIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) {
    return { ok: false, formError: "bankAccountNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  const toDelete = await db
    .select({ id: bankAccounts.id, qrCodeUrl: bankAccounts.qrCodeUrl })
    .from(bankAccounts)
    .where(inArray(bankAccounts.id, ids));

  // Matches legacy delete_bank_account(): transactions are removed with the
  // account (schema FK is ON DELETE CASCADE, delete_bank_transactions call
  // in legacy is just belt-and-suspenders for a DB without FK support).
  await db.delete(bankAccounts).where(inArray(bankAccounts.id, ids));
  await Promise.all(toDelete.map((row) => deleteQrCodeFile(row.qrCodeUrl)));

  revalidatePath(`/${companySlug}/bank-accounts`);
  return { ok: true, message: "bankAccountsDeleted", count: ids.length };
}

export async function transferBetweenAccountsAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessCashBank(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const accountRows = await db
    .select({ id: bankAccounts.id, bankName: bankAccounts.bankName, displayName: bankAccounts.displayName })
    .from(bankAccounts)
    .where(inArray(bankAccounts.id, [data.fromAccountId, data.toAccountId]));
  const fromAccount = accountRows.find((row) => row.id === data.fromAccountId);
  const toAccount = accountRows.find((row) => row.id === data.toAccountId);
  if (!fromAccount) return { ok: false, fieldErrors: { fromAccountId: ["bankAccountNotFound"] } };
  if (!toAccount) return { ok: false, fieldErrors: { toAccountId: ["bankAccountNotFound"] } };

  const fromLabel = accountLabel(fromAccount);
  const toLabel = accountLabel(toAccount);
  const noteOut = data.note ? `Transfer to: ${toLabel} — ${data.note}` : `Transfer to: ${toLabel}`;
  const noteIn = data.note ? `Transfer from: ${fromLabel} — ${data.note}` : `Transfer from: ${fromLabel}`;

  const [{ id: debitId }] = await db
    .insert(bankTransactions)
    .values({
      bankAccountId: data.fromAccountId,
      txnDate: data.transferDate,
      txnType: "debit",
      transactionType: "transfer",
      transactionRefId: null,
      amount: data.amount.toFixed(2),
      referenceNo: "TRANSFER",
      note: noteOut,
    })
    .$returningId();

  const [{ id: creditId }] = await db
    .insert(bankTransactions)
    .values({
      bankAccountId: data.toAccountId,
      txnDate: data.transferDate,
      txnType: "credit",
      transactionType: "transfer",
      transactionRefId: debitId,
      amount: data.amount.toFixed(2),
      referenceNo: "TRANSFER",
      note: noteIn,
    })
    .$returningId();

  await db.update(bankTransactions).set({ transactionRefId: creditId }).where(eq(bankTransactions.id, debitId));

  revalidatePath(`/${companySlug}/bank-accounts`);
  revalidatePath(`/${companySlug}/bank-accounts/${data.fromAccountId}`);
  revalidatePath(`/${companySlug}/bank-accounts/${data.toAccountId}`);
  return { ok: true, message: "transferCompleted" };
}

export async function updateTransferAction(companySlug, txnId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessCashBank(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = editTransferSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const resolved = await resolveTransferPair(db, Number(txnId));
  if (!resolved) {
    return { ok: false, fieldErrors: {}, formError: "transferNotFound" };
  }
  const { debitTxn, creditTxn, fromAccount, toAccount } = resolved;

  const fromLabel = fromAccount ? accountLabel(fromAccount) : "Unknown";
  const toLabel = toAccount ? accountLabel(toAccount) : "Unknown";
  const noteOut = data.note ? `Transfer to: ${toLabel} — ${data.note}` : `Transfer to: ${toLabel}`;
  const noteIn = data.note ? `Transfer from: ${fromLabel} — ${data.note}` : `Transfer from: ${fromLabel}`;

  await Promise.all([
    debitTxn
      ? db
          .update(bankTransactions)
          .set({ amount: data.amount.toFixed(2), txnDate: data.transferDate, note: noteOut })
          .where(eq(bankTransactions.id, debitTxn.id))
      : null,
    creditTxn
      ? db
          .update(bankTransactions)
          .set({ amount: data.amount.toFixed(2), txnDate: data.transferDate, note: noteIn })
          .where(eq(bankTransactions.id, creditTxn.id))
      : null,
  ]);

  revalidatePath(`/${companySlug}/bank-accounts`);
  if (fromAccount) revalidatePath(`/${companySlug}/bank-accounts/${fromAccount.id}`);
  if (toAccount) revalidatePath(`/${companySlug}/bank-accounts/${toAccount.id}`);
  return { ok: true, message: "transferUpdated" };
}

// Client-side flow mirrors uploadOrganizationLogoAction/LogoUploadField
// (organizations/actions.js): pick a file -> upload immediately -> store
// the returned URL in form state -> submitted with the rest of the bank
// account form on Save. Unlike the org logo, this saves to this server's
// own public/uploads/ directory rather than Firebase Storage, per explicit
// instruction — also sidesteps the still-not-provisioned Storage bucket
// (see HANDOFF.md §5).
export async function uploadBankQrCodeAction(companySlug, formData) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessCashBank(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const file = formData.get("qrCode");
  if (!file || typeof file === "string") {
    return { ok: false, formError: "qrCodeRequired" };
  }
  const extension = QR_MIME_EXTENSIONS[file.type];
  if (!extension) {
    return { ok: false, formError: "qrCodeInvalidType" };
  }
  if (file.size > MAX_QR_BYTES) {
    return { ok: false, formError: "qrCodeTooLarge" };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `qr_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${extension}`;
    const dir = path.join(process.cwd(), "public", "uploads", "qr-codes", String(context.session.organizationId));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, fileName), buffer);

    return { ok: true, url: `${QR_UPLOAD_URL_PREFIX}${context.session.organizationId}/${fileName}` };
  } catch (error) {
    console.error("[bank-accounts] uploadBankQrCodeAction failed", error);
    return { ok: false, formError: "qrCodeUploadFailed" };
  }
}
