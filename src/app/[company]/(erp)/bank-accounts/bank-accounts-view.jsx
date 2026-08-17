"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight, BookOpen, Check, Landmark, Loader2, Pencil, Plus, QrCode, Trash2, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { DualDateField } from "@/components/dual-date-field";
import { notify } from "@/lib/toast";
import { cn, decimalToInputValue } from "@/lib/utils";
import {
  createBankAccountAction,
  deleteBankAccountsAction,
  transferBetweenAccountsAction,
  updateBankAccountAction,
  uploadBankQrCodeAction,
} from "./actions";

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BankBalance({ value }) {
  const negative = Number(value) < 0;
  return (
    <span className={cn("font-medium tabular-nums", negative ? "text-destructive" : "text-foreground")}>
      NPR {formatAmount(Math.abs(Number(value) || 0))}
    </span>
  );
}

const EMPTY_FORM = {
  displayName: "",
  bankName: "",
  openingBalance: "0",
  asOfDate: "",
  status: "active",
  printOnInvoice: false,
  accountNumber: "",
  accountHolderName: "",
  branch: "",
  qrCodeUrl: "",
};

function toFormValues(account) {
  return {
    displayName: account.displayName ?? "",
    bankName: account.bankName ?? "",
    openingBalance: decimalToInputValue(account.openingBalance),
    asOfDate: account.asOfDate ?? "",
    status: account.status ?? "active",
    printOnInvoice: account.printOnInvoice === 1,
    accountNumber: account.accountNumber ?? "",
    accountHolderName: account.accountHolderName ?? "",
    branch: account.branch ?? "",
    qrCodeUrl: account.qrCodeUrl ?? "",
  };
}

/**
 * List/create/edit shell for the Cash & Bank module — same page ->
 * {Module}View -> {Module}Form shape as Items/Parties/Units. Row click opens
 * the account's ledger (bank-accounts/[account]/page.js), mirroring how
 * Parties' row click opens the party ledger — editing/deleting live in the
 * Actions column instead. Transfer is a separate global action (only shown
 * once there are >=2 accounts to move money between, same guard as legacy).
 */
export default function BankAccountsView({ companySlug, initialBankAccounts }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFromId, setTransferFromId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, startDeleteTransition] = useTransition();

  function openCreate() {
    setEditingAccount(null);
    setSheetOpen(true);
  }

  function openEdit(account) {
    setEditingAccount(account);
    setSheetOpen(true);
  }

  function openLedger(account) {
    router.push(`/${companySlug}/bank-accounts/${account.id}`);
  }

  function openTransfer(fromId = null) {
    setTransferFromId(fromId);
    setTransferOpen(true);
  }

  function handleDeleteOne(account) {
    if (!window.confirm(t("confirmDeleteBankAccounts", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deleteBankAccountsAction(companySlug, [account.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("bankAccountsDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeleteBankAccounts", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deleteBankAccountsAction(companySlug, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("bankAccountsDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [
    {
      key: "bankName",
      header: t("bankName"),
      sortable: true,
      render: (account) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <Landmark className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{account.bankName}</p>
            <p className="truncate text-xs text-muted-foreground">{account.displayName || t("notSet")}</p>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: t("status"),
      render: (account) => (
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium",
            account.status === "active" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"
          )}
        >
          {t(account.status === "active" ? "active" : "inactive")}
        </span>
      ),
    },
    {
      key: "currentBalance",
      header: t("currentBalance"),
      sortable: true,
      className: "flex-none w-40 justify-end text-right",
      render: (account) => <BankBalance value={account.currentBalance} />,
    },
  ];

  const rowActions = (account) => [
    { key: "ledger", label: t("transactions"), icon: BookOpen, onClick: () => openLedger(account) },
    { key: "edit", label: t("edit"), icon: Pencil, onClick: () => openEdit(account) },
    {
      key: "delete",
      label: t("delete"),
      icon: Trash2,
      variant: "destructive",
      disabled: deleting,
      onClick: () => handleDeleteOne(account),
    },
  ];

  const bulkActions = (ids, helpers) => [
    {
      key: "delete",
      label: t("delete"),
      icon: Trash2,
      variant: "destructive",
      loading: deleting,
      onClick: () => handleBulkDelete(ids, helpers),
    },
  ];

  return (
    <>
      <div className="flex justify-end gap-2">
        {initialBankAccounts.length >= 2 && (
          <Button type="button" variant="outline" onClick={() => openTransfer(null)}>
            <ArrowLeftRight className="h-4 w-4" />
            {t("transfer")}
          </Button>
        )}
        <Button type="button" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t("addBankAccount")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialBankAccounts}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onRowClick={openLedger}
          rowActions={rowActions}
          bulkActions={bulkActions}
          filters={[
            {
              key: "status",
              label: t("status"),
              options: [
                { value: "active", label: t("active") },
                { value: "inactive", label: t("inactive") },
              ],
            },
          ]}
          emptyIcon={Landmark}
          emptyMessage={t("noBankAccountsYet")}
          emptyAction={{ label: t("addBankAccount"), onClick: openCreate }}
        />
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editingAccount ? t("editBankAccount") : t("addBankAccount")}
      >
        <BankAccountForm
          companySlug={companySlug}
          account={editingAccount}
          onDone={(message) => {
            setSheetOpen(false);
            notify.success(t(message));
            router.refresh();
          }}
          onClose={() => setSheetOpen(false)}
        />
      </Sheet>

      {transferOpen && (
        <Modal open onClose={() => setTransferOpen(false)} title={t("transferBetweenAccounts")}>
          <TransferForm
            companySlug={companySlug}
            bankAccounts={initialBankAccounts}
            initialFromId={transferFromId}
            onClose={() => setTransferOpen(false)}
            onDone={(message) => {
              setTransferOpen(false);
              notify.success(t(message));
              router.refresh();
            }}
          />
        </Modal>
      )}
    </>
  );
}

export function BankAccountForm({ companySlug, account, onDone, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(account ? toFormValues(account) : EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit() {
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    startSubmit();
  }

  async function startSubmit() {
    const result = account
      ? await updateBankAccountAction(companySlug, account.id, form)
      : await createBankAccountAction(companySlug, form);
    setPending(false);
    if (!result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onDone(result.message);
  }

  return (
    <div className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="bank-name">{t("bankName")}</Label>
        <Input id="bank-name" className="h-11" value={form.bankName} onChange={(event) => update("bankName", event.target.value)} />
        {fieldErrors.bankName?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.bankName[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bank-display-name">{t("displayName")}</Label>
        <Input
          id="bank-display-name"
          className="h-11"
          value={form.displayName}
          onChange={(event) => update("displayName", event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("displayNameHint")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bank-opening-balance">{t("openingBalance")}</Label>
          <Input
            id="bank-opening-balance"
            type="number"
            className="h-11"
            value={form.openingBalance}
            onChange={(event) => update("openingBalance", event.target.value)}
          />
          {fieldErrors.openingBalance?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.openingBalance[0])}</p>}
        </div>
        <div className="space-y-1.5">
          <DualDateField
            id="bank-as-of-date"
            label={t("asOfDate")}
            value={form.asOfDate}
            onChange={(value) => update("asOfDate", value)}
            required
          />
          {fieldErrors.asOfDate?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.asOfDate[0])}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t("status")}</Label>
        <SegmentedControl
          options={[
            { value: "active", label: t("active") },
            { value: "inactive", label: t("inactive") },
          ]}
          value={form.status}
          onChange={(value) => update("status", value)}
        />
      </div>

      <QrCodeUploadField
        companySlug={companySlug}
        value={form.qrCodeUrl}
        onChange={(url) => update("qrCodeUrl", url)}
      />

      <div className="space-y-2 rounded-xl bg-muted/60 p-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="bank-print-on-invoice"
            checked={form.printOnInvoice}
            onCheckedChange={(checked) => update("printOnInvoice", checked === true)}
          />
          <Label htmlFor="bank-print-on-invoice" className="cursor-pointer">
            {t("printOnInvoice")}
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">{t("printOnInvoiceHint")}</p>

        {form.printOnInvoice && (
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="bank-account-number">{t("accountNumber")}</Label>
              <Input
                id="bank-account-number"
                className="h-11"
                value={form.accountNumber}
                onChange={(event) => update("accountNumber", event.target.value)}
              />
              {fieldErrors.accountNumber?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.accountNumber[0])}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank-account-holder">{t("accountHolderName")}</Label>
              <Input
                id="bank-account-holder"
                className="h-11"
                value={form.accountHolderName}
                onChange={(event) => update("accountHolderName", event.target.value)}
              />
              {fieldErrors.accountHolderName?.[0] && (
                <p className="text-xs text-destructive">{t(fieldErrors.accountHolderName[0])}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank-branch">{t("branch")}</Label>
              <Input id="bank-branch" className="h-11" value={form.branch} onChange={(event) => update("branch", event.target.value)} />
              {fieldErrors.branch?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.branch[0])}</p>}
            </div>
          </div>
        )}
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

function QrCodeUploadField({ companySlug, value, onChange }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("qrCode", file);
    const result = await uploadBankQrCodeAction(companySlug, formData);
    setUploading(false);

    if (!result.ok) {
      notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
      return;
    }
    onChange(result.url);
  }

  return (
    <div className="space-y-1.5">
      <Label>{t("qrCode")}</Label>
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-muted">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- server-uploaded file under public/uploads, not a build-time-optimizable asset
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <QrCode className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
          <Button type="button" variant="outline" className="h-9" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? t("uploading") : value ? t("changeQrCode") : t("uploadQrCode")}
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">{t("qrCodeHint")}</p>
        </div>
      </div>
    </div>
  );
}

export function TransferForm({ companySlug, bankAccounts, initialFromId, onClose, onDone }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    fromAccountId: initialFromId ? String(initialFromId) : "",
    toAccountId: "",
    amount: "",
    transferDate: "",
    note: "",
  });
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit() {
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    startSubmit();
  }

  async function startSubmit() {
    const result = await transferBetweenAccountsAction(companySlug, form);
    setPending(false);
    if (!result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onDone(result.message);
  }

  function accountLabel(account) {
    const suffix = account.displayName ? ` — ${account.displayName}` : "";
    return `${account.bankName}${suffix} (NPR ${formatAmount(account.currentBalance)})`;
  }

  const fromOptions = bankAccounts
    .filter((account) => String(account.id) !== form.toAccountId)
    .map((account) => ({ value: String(account.id), label: accountLabel(account) }));
  const toOptions = bankAccounts
    .filter((account) => String(account.id) !== form.fromAccountId)
    .map((account) => ({ value: String(account.id), label: accountLabel(account) }));

  return (
    <div className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">{t("transferHint")}</p>

      <div className="space-y-1.5">
        <Label htmlFor="transfer-from">{t("fromAccount")}</Label>
        <CreatableSelect
          id="transfer-from"
          options={fromOptions}
          value={form.fromAccountId}
          onChange={(value) => update("fromAccountId", value)}
          placeholder={t("fromAccount")}
        />
        {fieldErrors.fromAccountId?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.fromAccountId[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="transfer-to">{t("toAccount")}</Label>
        <CreatableSelect
          id="transfer-to"
          options={toOptions}
          value={form.toAccountId}
          onChange={(value) => update("toAccountId", value)}
          placeholder={t("toAccount")}
        />
        {fieldErrors.toAccountId?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.toAccountId[0])}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="transfer-amount">{t("transferAmount")}</Label>
          <Input
            id="transfer-amount"
            type="number"
            className="h-11"
            value={form.amount}
            onChange={(event) => update("amount", event.target.value)}
          />
          {fieldErrors.amount?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.amount[0])}</p>}
        </div>
        <div className="space-y-1.5">
          <DualDateField
            id="transfer-date"
            label={t("transferDate")}
            value={form.transferDate}
            onChange={(value) => update("transferDate", value)}
            required
          />
          {fieldErrors.transferDate?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.transferDate[0])}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="transfer-note">{t("note")}</Label>
        <Input
          id="transfer-note"
          className="h-11"
          value={form.note}
          onChange={(event) => update("note", event.target.value)}
          placeholder={t("optional")}
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
          {pending ? t("saving") : t("transfer")}
        </Button>
      </div>
    </div>
  );
}
