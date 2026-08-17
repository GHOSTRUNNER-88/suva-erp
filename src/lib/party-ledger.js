import { eq, sql } from "drizzle-orm";
import { creditNotes, debitNotes, expenses, parties, payments, purchaseBills, salesInvoices } from "@/db/schema/organization";

/**
 * Shared party-balance recalculation — ported from legacy
 * models/Party.php's recalculate_party_balance()/party_closing_balance()
 * (verified in full). `parties.balance` is a signed cache (positive = Dr,
 * they/we owe; negative = Cr) that is ALWAYS fully recomputed from scratch,
 * never nudged by a delta — a missed edge case self-heals the next time
 * this party's balance changes instead of drifting further. Every module
 * that writes a party-ledger-relevant document (sales invoice, purchase
 * bill, payment, credit/debit note, expense) must call this after its
 * write — see ../../AGENTS.md §6's "Party ledger balance is signed" note.
 *
 * Not a "use server" file — same reasoning as lib/inventory.js: this takes
 * a raw partyId with no auth check of its own, safe only when called from
 * within an already-authenticated server action.
 *
 * Sign convention per document type, verified against legacy's
 * get_party_ledger() (models/Party.php): sales invoices and debit notes
 * post Dr(+); purchase bills, credit notes, payment-in, and expenses post
 * Cr(-); payment-out posts Dr(+). Deliberately preserves a legacy quirk:
 * sales_invoices/purchase_bills/expenses filter out cancelled rows, but
 * credit_notes/debit_notes do NOT (no status filter on those two in
 * legacy's own query) — don't "fix" this, it's a verified quirk, not a bug.
 */
export async function recalculatePartyBalance(db, partyId) {
  const id = Number(partyId);
  if (!id || id <= 0) return;

  const [party] = await db
    .select({ openingBalance: parties.openingBalance, openingBalanceType: parties.openingBalanceType })
    .from(parties)
    .where(eq(parties.id, id))
    .limit(1);
  if (!party) return;

  const openingSigned = party.openingBalanceType === "Cr" ? -Number(party.openingBalance) : Number(party.openingBalance);

  const [invoiceSum] = await db
    .select({ total: sql`COALESCE(SUM(${salesInvoices.totalAmount}), 0)` })
    .from(salesInvoices)
    .where(sql`${salesInvoices.partyId} = ${id} AND ${salesInvoices.status} != 'cancelled'`);

  const [billSum] = await db
    .select({ total: sql`COALESCE(SUM(${purchaseBills.totalAmount}), 0)` })
    .from(purchaseBills)
    .where(sql`${purchaseBills.partyId} = ${id} AND ${purchaseBills.status} != 'cancelled'`);

  const [creditNoteSum] = await db
    .select({ total: sql`COALESCE(SUM(${creditNotes.totalAmount}), 0)` })
    .from(creditNotes)
    .where(eq(creditNotes.partyId, id));

  const [debitNoteSum] = await db
    .select({ total: sql`COALESCE(SUM(${debitNotes.totalAmount}), 0)` })
    .from(debitNotes)
    .where(eq(debitNotes.partyId, id));

  const [expenseSum] = await db
    .select({ total: sql`COALESCE(SUM(${expenses.amount}), 0)` })
    .from(expenses)
    .where(sql`${expenses.partyId} = ${id} AND ${expenses.status} != 'cancelled'`);

  const [paymentInSum] = await db
    .select({ total: sql`COALESCE(SUM(${payments.amount}), 0)` })
    .from(payments)
    .where(sql`${payments.partyId} = ${id} AND ${payments.paymentType} = 'in'`);

  const [paymentOutSum] = await db
    .select({ total: sql`COALESCE(SUM(${payments.amount}), 0)` })
    .from(payments)
    .where(sql`${payments.partyId} = ${id} AND ${payments.paymentType} = 'out'`);

  const net =
    Number(invoiceSum.total) -
    Number(billSum.total) -
    Number(creditNoteSum.total) +
    Number(debitNoteSum.total) -
    Number(expenseSum.total) -
    Number(paymentInSum.total) +
    Number(paymentOutSum.total);

  const signedBalance = openingSigned + net;

  await db
    .update(parties)
    .set({ balance: signedBalance.toFixed(2) })
    .where(eq(parties.id, id));
}
