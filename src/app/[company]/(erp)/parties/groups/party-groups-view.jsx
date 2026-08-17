"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Check, Layers, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { notify } from "@/lib/toast";
import { createPartyGroupAction, deletePartyGroupsAction, updatePartyGroupAction } from "../actions";

const EMPTY_FORM = { name: "", description: "" };

export default function PartyGroupsView({ companySlug, initialGroups }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, startDeleteTransition] = useTransition();

  function openCreate() {
    setEditingGroup(null);
    setSheetOpen(true);
  }

  function openEdit(group) {
    setEditingGroup(group);
    setSheetOpen(true);
  }

  function openDetail(group) {
    router.push(`/${companySlug}/parties/groups/${group.id}`);
  }

  function handleDeleteOne(group) {
    if (!window.confirm(t("confirmDeletePartyGroups", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deletePartyGroupsAction(companySlug, [group.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("partyGroupsDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeletePartyGroups", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deletePartyGroupsAction(companySlug, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("partyGroupsDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [
    { key: "name", header: t("partyGroupName"), sortable: true },
    { key: "description", header: t("description"), render: (group) => group.description || "—" },
    { key: "partyCount", header: t("partyCount"), sortable: true },
  ];

  const rowActions = (group) => [
    { key: "edit", label: t("edit"), icon: Pencil, onClick: () => openEdit(group) },
    { key: "delete", label: t("delete"), icon: Trash2, variant: "destructive", disabled: deleting, onClick: () => handleDeleteOne(group) },
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
          {t("addPartyGroup")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialGroups}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onRowClick={openDetail}
          rowActions={rowActions}
          bulkActions={bulkActions}
          emptyIcon={Layers}
          emptyMessage={t("noPartyGroupsYet")}
          emptyAction={{ label: t("addPartyGroup"), onClick: openCreate }}
        />
      </div>

      <Modal open={sheetOpen} onClose={() => setSheetOpen(false)} title={editingGroup ? t("editPartyGroup") : t("addPartyGroup")}>
        <PartyGroupForm
          companySlug={companySlug}
          group={editingGroup}
          onDone={(message) => {
            setSheetOpen(false);
            notify.success(t(message));
            router.refresh();
          }}
          onClose={() => setSheetOpen(false)}
        />
      </Modal>
    </>
  );
}

function PartyGroupForm({ companySlug, group, onDone, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(group ? { name: group.name ?? "", description: group.description ?? "" } : EMPTY_FORM);
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
    const result = group
      ? await updatePartyGroupAction(companySlug, group.id, form)
      : await createPartyGroupAction(companySlug, form);
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
        <Label htmlFor="group-name">{t("partyGroupName")}</Label>
        <Input id="group-name" className="h-11" value={form.name} onChange={(event) => update("name", event.target.value)} />
        {fieldErrors.name?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.name[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="group-description">{t("description")}</Label>
        <Input
          id="group-description"
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
