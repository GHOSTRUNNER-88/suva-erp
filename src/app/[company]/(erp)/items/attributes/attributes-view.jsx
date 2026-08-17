"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { notify } from "@/lib/toast";
import { createAttributeAction, deleteAttributesAction, updateAttributeAction } from "./actions";

const EMPTY_FORM = { name: "" };

export default function AttributesView({ companySlug, initialAttributes }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, startDeleteTransition] = useTransition();

  function openCreate() {
    setEditingAttribute(null);
    setModalOpen(true);
  }

  function openEdit(attribute) {
    setEditingAttribute(attribute);
    setModalOpen(true);
  }

  function openDetail(attribute) {
    router.push(`/${companySlug}/items/attributes/${attribute.id}`);
  }

  function handleDeleteOne(attribute) {
    if (!window.confirm(t("confirmDeleteAttributes", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deleteAttributesAction(companySlug, [attribute.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("attributesDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeleteAttributes", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deleteAttributesAction(companySlug, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("attributesDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [
    { key: "name", header: t("attributeName"), sortable: true },
    { key: "valueCount", header: t("valueCount"), sortable: true },
  ];

  const rowActions = (attribute) => [
    { key: "edit", label: t("edit"), icon: Pencil, onClick: () => openEdit(attribute) },
    {
      key: "delete",
      label: t("delete"),
      icon: Trash2,
      variant: "destructive",
      disabled: deleting,
      onClick: () => handleDeleteOne(attribute),
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
          {t("addAttribute")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialAttributes}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onRowClick={openDetail}
          rowActions={rowActions}
          bulkActions={bulkActions}
          emptyIcon={Tags}
          emptyMessage={t("noAttributesYet")}
          emptyAction={{ label: t("addAttribute"), onClick: openCreate }}
        />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingAttribute ? t("editAttribute") : t("addAttribute")}>
        <AttributeForm
          companySlug={companySlug}
          attribute={editingAttribute}
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

function AttributeForm({ companySlug, attribute, onDone, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(attribute ? { name: attribute.name ?? "" } : EMPTY_FORM);
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
    const result = attribute
      ? await updateAttributeAction(companySlug, attribute.id, form)
      : await createAttributeAction(companySlug, form);
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
        <Label htmlFor="attribute-name">{t("attributeName")}</Label>
        <Input
          id="attribute-name"
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
