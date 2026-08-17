"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { notify } from "@/lib/toast";
import { createExpenseCategoryAction, deleteExpenseCategoriesAction, updateExpenseCategoryAction } from "./actions";

const EMPTY_FORM = { name: "", description: "" };

/**
 * List/create/edit shell for Expense Categories — same page ->
 * {Module}View -> {Module}Form shape as Item Categories (the closest
 * existing analog: a simple named list with a description, no icon/no line
 * items — see @/db/schema/organization.js's expenseCategories table).
 * Deleting a category never blocks even when expenses reference it — the FK
 * is ON DELETE SET NULL, matching legacy exactly (see ./actions.js).
 */
export default function ExpenseCategoriesView({ companySlug, initialCategories }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, startDeleteTransition] = useTransition();

  function openCreate() {
    setEditingCategory(null);
    setModalOpen(true);
  }

  function openEdit(category) {
    setEditingCategory(category);
    setModalOpen(true);
  }

  function handleDeleteOne(category) {
    if (!window.confirm(t("confirmDeleteExpenseCategories", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deleteExpenseCategoriesAction(companySlug, [category.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("expenseCategoriesDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeleteExpenseCategories", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deleteExpenseCategoriesAction(companySlug, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("expenseCategoriesDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [
    {
      key: "name",
      header: t("expenseCategoryName"),
      sortable: true,
      render: (category) => <p className="truncate font-medium">{category.name}</p>,
    },
    { key: "description", header: t("description"), render: (category) => category.description || "—" },
    { key: "expenseCount", header: t("expenseCount"), sortable: true },
  ];

  const rowActions = (category) => [
    { key: "edit", label: t("edit"), icon: Pencil, onClick: () => openEdit(category) },
    {
      key: "delete",
      label: t("delete"),
      icon: Trash2,
      variant: "destructive",
      disabled: deleting,
      onClick: () => handleDeleteOne(category),
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
          {t("addExpenseCategory")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialCategories}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          rowActions={rowActions}
          bulkActions={bulkActions}
          emptyIcon={Receipt}
          emptyMessage={t("noExpenseCategoriesYet")}
          emptyAction={{ label: t("addExpenseCategory"), onClick: openCreate }}
        />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCategory ? t("editExpenseCategory") : t("addExpenseCategory")}
      >
        <ExpenseCategoryForm
          companySlug={companySlug}
          category={editingCategory}
          onDone={(message) => {
            setModalOpen(false);
            notify.success(t(message));
            router.refresh();
          }}
          onClose={() => setModalOpen(false)}
        />
      </Modal>
    </>
  );
}

export function ExpenseCategoryForm({ companySlug, category, onDone, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(
    category ? { name: category.name ?? "", description: category.description ?? "" } : EMPTY_FORM
  );
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
    const result = category
      ? await updateExpenseCategoryAction(companySlug, category.id, form)
      : await createExpenseCategoryAction(companySlug, form);
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
        <Label htmlFor="expense-category-name">{t("expenseCategoryName")}</Label>
        <Input
          id="expense-category-name"
          className="h-11"
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
        />
        {fieldErrors.name?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.name[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="expense-category-description">{t("description")}</Label>
        <Input
          id="expense-category-description"
          className="h-11"
          value={form.description}
          onChange={(event) => update("description", event.target.value)}
          placeholder={t("optional")}
        />
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
