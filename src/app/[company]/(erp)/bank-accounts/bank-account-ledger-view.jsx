"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight, Check, Landmark, Loader2, Pencil, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DualDateField } from "@/components/dual-date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Sheet } from "@/components/ui/sheet";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { BankAccountForm, TransferForm } from "./bank-accounts-view";
import { deleteBankAccountsAction, updateTransferAction } from "./actions";

const TXN_TYPE_LABEL_KEYS = {
  opening_balance: "openingBalance",
  sales: "sales",
  purchase: "purchase",
  payment_in: "paymentIn",
  payment_out: "paymentOut",
  expense: "expense",
  transfer: "transfer",
  manual: "manual",
  credit_note: "creditNote",
  debit_note: "debitNote",
  vat_payment: "vatPayment",
};

// Fixed CSS grid, not the shared DataTable — a running Balance column only
// means anything in a fixed chronological order (see getBankAccountLedger),
// which is fundamentally incompatible with DataTable's click-to-sort
// columns. min-w-0 on every cell is deliberate: a flex/grid item's default
// min-width is its content's natural size, not 0 — omit it and a long badge
// or note can force that column wider than its track, which is exactly the
// header/body misalignment bug already hit and fixed in data-table.jsx.
const LEDGER_GRID = "grid grid-cols-[96px_140px_100px_1fr_100px_100px_130px_44px] gap-3";

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-CA").format(new Date(value));
}

// Reverses the note text transferBetweenAccountsAction/updateTransferAction
// build ("Transfer to: X — custom note" / "Transfer from: X — custom note")
// back into the counterparty label and the user's own custom note — same
// split legacy's txn_action_html() does, just done client-side here since
// this view already has the row's note without a extra fetch.
function parseTransferNote(txnType, note) {
  const text = note || "";
  const sepIndex = text.indexOf(" — ");
  const customNote = sepIndex === -1 ? "" : text.slice(sepIndex + 3);
  const prefix = txnType === "debit" ? "Transfer to: " : "Transfer from: ";
  const labelEnd = sepIndex === -1 ? text.length : sepIndex;
  const counterparty = text.startsWith(prefix) ? text.slice(prefix.length, labelEnd) : "—";
  return { counterparty, customNote };
}

/**
 * Bank account header + its transaction ledger — mirrors parties/
 * party-ledger-view.jsx's shape (standalone route, header card + table),
 * except this ledger has real ongoing rows (opening balance + transfers
 * today, sales/purchase/payments once those modules exist) instead of just
 * a static opening-balance line, so it uses the shared DataTable instead of
 * a hand-rolled grid.
 */
export function BankAccountLedgerView({
  companySlug,
  account,
  transactions,
  currentBalance,
  openingBalanceBeforeFilter,
  totalCredit,
  totalDebit,
  filter,
  bankAccounts,
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editTransferTxn, setEditTransferTxn] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [fromDraft, setFromDraft] = useState(filter.from);
  const [toDraft, setToDraft] = useState(filter.to);

  function applyFilter() {
    const query = new URLSearchParams();
    if (fromDraft) query.set("from", fromDraft);
    if (toDraft) query.set("to", toDraft);
    const qs = query.toString();
    router.push(`/${companySlug}/bank-accounts/${account.id}${qs ? `?${qs}` : ""}`);
  }

  function clearFilter() {
    setFromDraft("");
    setToDraft("");
    router.push(`/${companySlug}/bank-accounts/${account.id}`);
  }

  async function handleDelete() {
    if (!window.confirm(t("confirmDeleteBankAccounts", { count: 1 }))) return;
    setDeleting(true);
    const result = await deleteBankAccountsAction(companySlug, [account.id]);
    setDeleting(false);
    if (!result.ok) {
      notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
      return;
    }
    notify.success(t("bankAccountsDeleted", { count: result.count }));
    router.push(`/${companySlug}/bank-accounts`);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t("totalIn")} value={totalCredit} tone="positive" />
        <StatCard label={t("totalOut")} value={totalDebit} tone="negative" />
        <StatCard label={t("currentBalance")} value={currentBalance} tone={currentBalance < 0 ? "negative" : "neutral"} />
      </div>

      <div className="rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
              <Landmark className="h-6 w-6" />
            </span>
            <div>
              <p className="text-lg font-semibold">{account.bankName}</p>
              <p className="text-sm text-muted-foreground">{account.displayName || t("notSet")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                account.status === "active" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"
              )}
            >
              {t(account.status === "active" ? "active" : "inactive")}
            </span>
            {bankAccounts.length >= 2 && (
              <Button type="button" size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight className="h-3.5 w-3.5" />
                {t("transfer")}
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              {t("edit")}
            </Button>
            <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {t("delete")}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailField label={t("openingBalance")} value={`NPR ${formatAmount(account.openingBalance)}`} />
          <DetailField label={t("asOfDate")} value={formatDate(account.asOfDate)} />
          <DetailField label={t("printOnInvoice")} value={account.printOnInvoice ? t("yes") : t("no")} />
          <DetailField label={t("accountNumber")} value={account.accountNumber || "—"} />
          {account.accountHolderName && <DetailField label={t("accountHolderName")} value={account.accountHolderName} />}
          {account.branch && <DetailField label={t("branch")} value={account.branch} />}
        </div>

        {account.qrCodeUrl && (
          <div className="mt-4 border-t pt-4">
            <p className="mb-2 text-xs text-muted-foreground">{t("qrCode")}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- server-uploaded file under public/uploads */}
            <img src={account.qrCodeUrl} alt="" className="h-28 w-28 rounded-lg border object-cover" />
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-background">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-sm font-semibold">{t("transactions")}</h2>
            {openingBalanceBeforeFilter !== null && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("openingBalanceBeforeDate", { date: formatDate(filter.from) })}:{" "}
                <span className="font-medium text-foreground">
                  NPR {formatAmount(Math.abs(openingBalanceBeforeFilter))} {openingBalanceBeforeFilter < 0 ? "(-)" : ""}
                </span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <DualDateField id="txn-from" label={t("from")} value={fromDraft} onChange={setFromDraft} />
            <DualDateField id="txn-to" label={t("to")} value={toDraft} onChange={setToDraft} />
            <Button type="button" size="sm" onClick={applyFilter}>
              {t("apply")}
            </Button>
            {(filter.from || filter.to) && (
              <Button type="button" size="sm" variant="outline" onClick={clearFilter}>
                {t("clear")}
              </Button>
            )}
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-muted-foreground">
            <Landmark className="h-8 w-8 opacity-40" />
            <p className="text-sm">{t("noTransactionsYet")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className={cn(LEDGER_GRID, "min-w-225 border-b bg-muted/60 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase")}>
              <span>{t("transactionDate")}</span>
              <span>{t("transactionType")}</span>
              <span>{t("referenceNo")}</span>
              <span>{t("note")}</span>
              <span className="text-right">{t("Dr")}</span>
              <span className="text-right">{t("Cr")}</span>
              <span className="text-right">{t("balance")}</span>
              <span />
            </div>
            {transactions.map((txn) => (
              <div
                key={txn.id}
                className={cn(LEDGER_GRID, "min-w-225 items-center border-b px-4 py-3 text-sm last:border-b-0")}
              >
                <span className="min-w-0 truncate text-xs text-muted-foreground">{formatDate(txn.txnDate)}</span>
                <span className="min-w-0">
                  <span className="inline-block max-w-full truncate rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                    {t(TXN_TYPE_LABEL_KEYS[txn.transactionType] ?? "manual")}
                  </span>
                </span>
                <span className="min-w-0 truncate text-xs text-muted-foreground">{txn.referenceNo || "—"}</span>
                <span className="min-w-0 truncate text-xs text-muted-foreground">{txn.note || "—"}</span>
                <span className="min-w-0 text-right text-xs tabular-nums text-destructive">
                  {txn.txnType === "debit" ? formatAmount(txn.amount) : "—"}
                </span>
                <span className="min-w-0 text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-400">
                  {txn.txnType === "credit" ? formatAmount(txn.amount) : "—"}
                </span>
                <span
                  className={cn(
                    "min-w-0 text-right text-sm font-medium tabular-nums",
                    txn.runningBalance < 0 ? "text-destructive" : "text-foreground"
                  )}
                >
                  {formatAmount(Math.abs(txn.runningBalance))}
                  {txn.runningBalance < 0 ? " (-)" : ""}
                </span>
                <span className="flex min-w-0 justify-end">
                  {txn.transactionType === "transfer" && (
                    <button
                      type="button"
                      onClick={() => setEditTransferTxn(txn)}
                      aria-label={t("editTransfer")}
                      title={t("editTransfer")}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title={t("editBankAccount")}>
        <BankAccountForm
          companySlug={companySlug}
          account={account}
          onDone={(message) => {
            setEditOpen(false);
            notify.success(t(message));
            router.refresh();
          }}
          onClose={() => setEditOpen(false)}
        />
      </Sheet>

      {transferOpen && (
        <Modal open onClose={() => setTransferOpen(false)} title={t("transferBetweenAccounts")}>
          <TransferForm
            companySlug={companySlug}
            bankAccounts={bankAccounts}
            initialFromId={account.id}
            onClose={() => setTransferOpen(false)}
            onDone={(message) => {
              setTransferOpen(false);
              notify.success(t(message));
              router.refresh();
            }}
          />
        </Modal>
      )}

      {editTransferTxn && (
        <Modal open onClose={() => setEditTransferTxn(null)} title={t("editTransfer")}>
          <EditTransferForm
            companySlug={companySlug}
            txn={editTransferTxn}
            onClose={() => setEditTransferTxn(null)}
            onDone={(message) => {
              setEditTransferTxn(null);
              notify.success(t(message));
              router.refresh();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "negative"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-lg font-semibold tabular-nums", toneClass)}>NPR {formatAmount(Math.abs(value))}</p>
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

function EditTransferForm({ companySlug, txn, onClose, onDone }) {
  const { t } = useTranslation();
  const { counterparty, customNote } = parseTransferNote(txn.txnType, txn.note);
  const [form, setForm] = useState({
    amount: String(Number(txn.amount)),
    transferDate: txn.txnDate,
    note: customNote,
  });
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit() {
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    const result = await updateTransferAction(companySlug, txn.id, form);
    setPending(false);
    if (!result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onDone(result.message);
  }

  const routeLabel = txn.txnType === "debit" ? `→ ${counterparty}` : `← ${counterparty}`;

  return (
    <div className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <p className="text-sm text-muted-foreground">{routeLabel}</p>

      <div className="space-y-1.5">
        <Label htmlFor="edit-transfer-amount">{t("transferAmount")}</Label>
        <Input
          id="edit-transfer-amount"
          type="number"
          className="h-11"
          value={form.amount}
          onChange={(event) => update("amount", event.target.value)}
        />
        {fieldErrors.amount?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.amount[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <DualDateField id="edit-transfer-date" label={t("transferDate")} value={form.transferDate} onChange={(value) => update("transferDate", value)} required />
        {fieldErrors.transferDate?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.transferDate[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-transfer-note">{t("note")}</Label>
        <Input id="edit-transfer-note" className="h-11" value={form.note} onChange={(event) => update("note", event.target.value)} placeholder={t("optional")} />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {pending ? t("saving") : t("saveChanges")}
        </Button>
      </div>
    </div>
  );
}
