"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { CategoryIcon, IconPicker } from "@/components/ui/icon-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { notify } from "@/lib/toast";
import {
  createItemCategoryAction,
  deleteItemCategoriesAction,
  updateItemCategoryAction,
} from "../actions";

const EMPTY_FORM = { name: "", description: "", icon: "" };

export default function ItemCategoriesView({ companySlug, initialCategories }) {
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
    if (!window.confirm(t("confirmDeleteItemCategories", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deleteItemCategoriesAction(companySlug, [category.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("itemCategoriesDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeleteItemCategories", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deleteItemCategoriesAction(companySlug, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("itemCategoriesDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [
    {
      key: "name",
      header: t("itemCategoryName"),
      sortable: true,
      render: (category) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <CategoryIcon name={category.icon} className="h-3.5 w-3.5" />
          </span>
          <p className="truncate">{category.name}</p>
        </div>
      ),
    },
    { key: "description", header: t("description"), render: (category) => category.description || "—" },
    { key: "itemCount", header: t("itemCount"), sortable: true },
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
          {t("addItemCategory")}
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
          emptyIcon={Tag}
          emptyMessage={t("noItemCategoriesYet")}
          emptyAction={{ label: t("addItemCategory"), onClick: openCreate }}
        />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCategory ? t("editItemCategory") : t("addItemCategory")}
      >
        <ItemCategoryForm
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

function ItemCategoryForm({ companySlug, category, onDone, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(
    category
      ? { name: category.name ?? "", description: category.description ?? "", icon: category.icon ?? "" }
      : EMPTY_FORM
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
      ? await updateItemCategoryAction(companySlug, category.id, form)
      : await createItemCategoryAction(companySlug, form);
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
        <Label htmlFor="category-name">{t("itemCategoryName")}</Label>
        <Input
          id="category-name"
          className="h-11"
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
        />
        {fieldErrors.name?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.name[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="category-icon">{t("icon")}</Label>
        <IconPicker id="category-icon" value={form.icon} onChange={(value) => update("icon", value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="category-description">{t("description")}</Label>
        <Input
          id="category-description"
          className="h-11"
          value={form.description}
          onChange={(event) => update("description", event.target.value)}
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
