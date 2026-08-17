"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { notify } from "@/lib/toast";
import { createAttributeValueAction, deleteAttributeValuesAction, updateAttributeValueAction } from "../actions";

export default function AttributeDetailView({ companySlug, attribute, initialValues }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingValue, setEditingValue] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, startDeleteTransition] = useTransition();

  function openCreate() {
    setEditingValue(null);
    setModalOpen(true);
  }

  function openEdit(value) {
    setEditingValue(value);
    setModalOpen(true);
  }

  function handleDeleteOne(value) {
    if (!window.confirm(t("confirmDeleteAttributeValues", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deleteAttributeValuesAction(companySlug, [value.id], attribute.id);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("attributeValuesDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeleteAttributeValues", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deleteAttributeValuesAction(companySlug, [...ids], attribute.id);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("attributeValuesDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [{ key: "name", header: t("attributeValueName"), sortable: true }];

  const rowActions = (value) => [
    { key: "edit", label: t("edit"), icon: Pencil, onClick: () => openEdit(value) },
    {
      key: "delete",
      label: t("delete"),
      icon: Trash2,
      variant: "destructive",
      disabled: deleting,
      onClick: () => handleDeleteOne(value),
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
          {t("addAttributeValue")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialValues}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          rowActions={rowActions}
          bulkActions={bulkActions}
          emptyIcon={Tag}
          emptyMessage={t("noAttributeValuesYet")}
          emptyAction={{ label: t("addAttributeValue"), onClick: openCreate }}
        />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingValue ? t("editAttributeValue") : t("addAttributeValue")}
      >
        <AttributeValueForm
          companySlug={companySlug}
          attrId={attribute.id}
          value={editingValue}
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

function AttributeValueForm({ companySlug, attrId, value, onDone, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ attrId, name: value?.name ?? "" });
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  function update(field, val) {
    setForm((current) => ({ ...current, [field]: val }));
  }

  function submit() {
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    startSubmit();
  }

  async function startSubmit() {
    const result = value
      ? await updateAttributeValueAction(companySlug, value.id, form)
      : await createAttributeValueAction(companySlug, form);
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
        <Label htmlFor="attribute-value-name">{t("attributeValueName")}</Label>
        <Input
          id="attribute-value-name"
          className="h-11"
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
        />
        {fieldErrors.name?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.name[0])}</p>}
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
