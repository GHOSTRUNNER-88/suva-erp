"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Sheet } from "@/components/ui/sheet";
import { DualDateField } from "@/components/dual-date-field";
import { round2 } from "@/lib/money";
import { notify } from "@/lib/toast";
import { decimalToInputValue } from "@/lib/utils";
import { ExpenseCategoryQuickAddForm } from "../expense-categories/expense-category-quick-add-form";
import { createExpenseAction, deleteExpensesAction, updateExpenseAction } from "./actions";

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ExpenseAmount({ value }) {
  return <span className="font-medium tabular-nums">NPR {formatAmount(value)}</span>;
}

const EMPTY_FORM = {
  expenseNumber: "",
  expenseDate: "",
  categoryId: "",
  partyId: "",
  description: "",
  taxableAmount: "0",
  nonTaxableAmount: "0",
  vatPercent: "0",
  isVatApplicable: false,
  bankAccountId: "",
  referenceNo: "",
  notes: "",
};

function toFormValues(expense) {
  return {
    expenseNumber: expense.expenseNumber ?? "",
    expenseDate: expense.expenseDate ?? "",
    categoryId: expense.categoryId ? String(expense.categoryId) : "",
    partyId: expense.partyId ? String(expense.partyId) : "",
    description: expense.description ?? "",
    taxableAmount: decimalToInputValue(expense.taxableAmount),
    nonTaxableAmount: decimalToInputValue(expense.nonTaxableAmount),
    vatPercent: decimalToInputValue(expense.vatPercent ?? 0),
    isVatApplicable: expense.isVatApplicable === 1,
    bankAccountId: expense.bankAccountId ? String(expense.bankAccountId) : "",
    referenceNo: expense.referenceNo ?? "",
    notes: expense.notes ?? "",
  };
}

/**
 * List/create/edit shell for Expenses — closest existing analog is Bank
 * Accounts (a transactional list where each row optionally posts to a bank
 * account), same page -> {Module}View -> {Module}Form shape as every other
 * module here. All calculation/VAT-force-disable/bank-posting/party-ledger
 * rules are enforced server-side in ./actions.js (never trust a client-
 * submitted total, per @/../AGENTS.md §5) — the totals shown below are a
 * best-effort live preview only.
 */
export default function ExpensesView({ companySlug, initialExpenses, categories, parties, bankAccounts }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, startDeleteTransition] = useTransition();

  function openCreate() {
    setEditingExpense(null);
    setSheetOpen(true);
  }

  function openEdit(expense) {
    setEditingExpense(expense);
    setSheetOpen(true);
  }

  function handleDeleteOne(expense) {
    if (!window.confirm(t("confirmDeleteExpenses", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deleteExpensesAction(companySlug, [expense.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("expensesDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeleteExpenses", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deleteExpensesAction(companySlug, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("expensesDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [
    {
      key: "expenseNumber",
      header: t("expenseNumber"),
      sortable: true,
      render: (expense) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{expense.expenseNumber}</p>
          <p className="truncate text-xs text-muted-foreground">#{expense.voucherNumber}</p>
        </div>
      ),
    },
    { key: "expenseDate", header: t("expenseDate"), sortable: true },
    { key: "categoryName", header: t("category"), render: (expense) => expense.categoryName || t("notSet") },
    { key: "partyName", header: t("party"), render: (expense) => expense.partyName || t("notSet") },
    {
      key: "amount",
      header: t("amount"),
      sortable: true,
      className: "flex-none w-36 justify-end text-right",
      render: (expense) => <ExpenseAmount value={expense.amount} />,
    },
    { key: "bankAccountName", header: t("bankAccount"), render: (expense) => expense.bankAccountName || "—" },
  ];

  const rowActions = (expense) => [
    { key: "edit", label: t("edit"), icon: Pencil, onClick: () => openEdit(expense) },
    {
      key: "delete",
      label: t("delete"),
      icon: Trash2,
      variant: "destructive",
      disabled: deleting,
      onClick: () => handleDeleteOne(expense),
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
      <div className="flex justify-end">
        <Button type="button" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t("addExpense")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialExpenses}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          rowActions={rowActions}
          bulkActions={bulkActions}
          filters={[
            {
              key: "categoryId",
              label: t("category"),
              options: categories.map((category) => ({ value: String(category.id), label: category.name })),
            },
          ]}
          emptyIcon={Receipt}
          emptyMessage={t("noExpensesYet")}
          emptyAction={{ label: t("addExpense"), onClick: openCreate }}
        />
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editingExpense ? t("editExpense") : t("addExpense")}
      >
        <ExpenseForm
          companySlug={companySlug}
          expense={editingExpense}
          categories={categories}
          parties={parties}
          bankAccounts={bankAccounts}
          onDone={(message) => {
            setSheetOpen(false);
            notify.success(t(message));
            router.refresh();
          }}
          onClose={() => setSheetOpen(false)}
        />
      </Sheet>
    </>
  );
}

export function ExpenseForm({ companySlug, expense, categories, parties, bankAccounts, onDone, onClose }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [form, setForm] = useState(expense ? toFormValues(expense) : EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [categoryQuickAdd, setCategoryQuickAdd] = useState(null);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleCreateCategory() {
    return new Promise((resolve) => {
      setCategoryQuickAdd({ resolve });
    });
  }

  function submit() {
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    startSubmit();
  }

  async function startSubmit() {
    const result = expense
      ? await updateExpenseAction(companySlug, expense.id, form)
      : await createExpenseAction(companySlug, form);
    setPending(false);
    if (!result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onDone(result.message);
  }

  // Client-side preview only — mirrors the server's own rule (see
  // ./actions.js's resolveVat) so the form never shows an "Apply VAT" state
  // the server would silently override, but the server always recomputes
  // this from scratch and is the only source of truth for what gets saved.
  const taxableAmount = Number(form.taxableAmount) || 0;
  const nonTaxableAmount = Number(form.nonTaxableAmount) || 0;
  const selectedCategory = categories.find((category) => String(category.id) === String(form.categoryId));
  const isSalaryCategory = (selectedCategory?.name ?? "").trim().toLowerCase() === "salary";
  const vatForceDisabled = isSalaryCategory || taxableAmount <= 0;
  const vatApplicable = form.isVatApplicable && !vatForceDisabled;
  const vatPercent = vatApplicable ? Number(form.vatPercent) || 0 : 0;
  const vatAmount = vatApplicable ? round2((taxableAmount * vatPercent) / 100) : 0;
  const grandTotal = round2(taxableAmount + nonTaxableAmount + vatAmount);

  const categoryOptions = categories.map((category) => ({ value: String(category.id), label: category.name }));
  const partyOptions = parties.map((party) => ({ value: String(party.id), label: party.name }));
  const bankAccountOptions = bankAccounts.map((account) => ({
    value: String(account.id),
    label: account.displayName ? `${account.bankName} (${account.displayName})` : account.bankName,
  }));

  return (
    <div className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      {expense && (
        <p className="text-xs text-muted-foreground">
          {t("voucherNumber")}: <span className="font-medium text-foreground">#{expense.voucherNumber}</span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="expense-number">{t("expenseNumber")}</Label>
          <Input
            id="expense-number"
            className="h-11"
            value={form.expenseNumber}
            onChange={(event) => update("expenseNumber", event.target.value)}
          />
          {fieldErrors.expenseNumber?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.expenseNumber[0])}</p>}
        </div>
        <div className="space-y-1.5">
          <DualDateField
            id="expense-date"
            label={t("expenseDate")}
            value={form.expenseDate}
            onChange={(value) => update("expenseDate", value)}
            required
          />
          {fieldErrors.expenseDate?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.expenseDate[0])}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="expense-category">{t("category")}</Label>
        <CreatableSelect
          id="expense-category"
          options={categoryOptions}
          value={form.categoryId}
          onChange={(value) => update("categoryId", value)}
          onCreateNew={handleCreateCategory}
          createNewLabel={t("addExpenseCategory")}
          placeholder={t("notSet")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="expense-party">{t("party")}</Label>
        <CreatableSelect
          id="expense-party"
          options={partyOptions}
          value={form.partyId}
          onChange={(value) => update("partyId", value)}
          placeholder={t("notSet")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="expense-description">{t("description")}</Label>
        <Input
          id="expense-description"
          className="h-11"
          value={form.description}
          onChange={(event) => update("description", event.target.value)}
          placeholder={t("optional")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="expense-taxable">{t("taxableAmount")}</Label>
          <Input
            id="expense-taxable"
            type="number"
            className="h-11"
            value={form.taxableAmount}
            onChange={(event) => update("taxableAmount", event.target.value)}
          />
          {fieldErrors.taxableAmount?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.taxableAmount[0])}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expense-non-taxable">{t("nonTaxableAmount")}</Label>
          <Input
            id="expense-non-taxable"
            type="number"
            className="h-11"
            value={form.nonTaxableAmount}
            onChange={(event) => update("nonTaxableAmount", event.target.value)}
          />
          {fieldErrors.nonTaxableAmount?.[0] && (
            <p className="text-xs text-destructive">{t(fieldErrors.nonTaxableAmount[0])}</p>
          )}
        </div>
      </div>

      <div className="space-y-2 rounded-xl bg-muted/60 p-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="expense-vat-applicable"
            checked={vatApplicable}
            disabled={vatForceDisabled}
            onCheckedChange={(checked) => update("isVatApplicable", checked === true)}
          />
          <Label htmlFor="expense-vat-applicable" className="cursor-pointer">
            {t("applyVat")}
          </Label>
        </div>
        {vatForceDisabled ? (
          <p className="text-xs text-muted-foreground">
            {isSalaryCategory ? t("vatDisabledSalaryHint") : t("vatDisabledNoTaxableHint")}
          </p>
        ) : (
          form.isVatApplicable && (
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="expense-vat-percent">{t("vatPercent")}</Label>
              <Input
                id="expense-vat-percent"
                type="number"
                className="h-11"
                value={form.vatPercent}
                onChange={(event) => update("vatPercent", event.target.value)}
              />
            </div>
          )
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="expense-bank-account">{t("bankAccount")}</Label>
        <CreatableSelect
          id="expense-bank-account"
          options={bankAccountOptions}
          value={form.bankAccountId}
          onChange={(value) => update("bankAccountId", value)}
          placeholder={t("notSet")}
        />
        <p className="text-xs text-muted-foreground">{t("bankAccountHint")}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="expense-reference">{t("referenceNo")}</Label>
        <Input
          id="expense-reference"
          className="h-11"
          value={form.referenceNo}
          onChange={(event) => update("referenceNo", event.target.value)}
          placeholder={t("optional")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="expense-notes">{t("notes")}</Label>
        <Input
          id="expense-notes"
          className="h-11"
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
          placeholder={t("optional")}
        />
      </div>

      <div className="space-y-1 rounded-xl border p-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>{t("vatAmount")}</span>
          <span className="tabular-nums">NPR {formatAmount(vatAmount)}</span>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <span>{t("grandTotal")}</span>
          <span className="tabular-nums">NPR {formatAmount(grandTotal)}</span>
        </div>
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

      {categoryQuickAdd && (
        <Modal
          open
          onClose={() => {
            categoryQuickAdd.resolve(null);
            setCategoryQuickAdd(null);
          }}
          title={t("addExpenseCategory")}
        >
          <ExpenseCategoryQuickAddForm
            companySlug={companySlug}
            onCancel={() => {
              categoryQuickAdd.resolve(null);
              setCategoryQuickAdd(null);
            }}
            onCreated={(result) => {
              categoryQuickAdd.resolve(result);
              setCategoryQuickAdd(null);
              router.refresh();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
