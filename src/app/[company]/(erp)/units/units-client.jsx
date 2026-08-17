"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Archive, ArchiveRestore, Check, Loader2, Pencil, Plus, Ruler } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { notify } from "@/lib/toast";
import { createUnitAction, setUnitActiveAction, updateUnitAction } from "./actions";

const EMPTY_FORM = { name: "", code: "", type: "" };

function toFormValues(unit) {
  return { name: unit.name ?? "", code: unit.code ?? "", type: unit.type ?? "" };
}

/**
 * Units management — migrated onto the shared DataTable (see parties/
 * items for the same page -> {Module}View -> {Module}Form shape) instead
 * of the earlier bespoke Card + useActionState form list. Units are never
 * hard-deleted (items/inventory reference them) — the only destructive-ish
 * action is deactivate, which is why there's no delete/bulk-delete here,
 * just a per-row activate/deactivate toggle and no `selectable` checkboxes
 * (nothing to do with a multi-selection once you can't bulk-act on it).
 */
export default function UnitsClient({ companySlug, initialUnits }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [toggling, startToggleTransition] = useTransition();

  function openCreate() {
    setEditingUnit(null);
    setModalOpen(true);
  }

  function openEdit(unit) {
    setEditingUnit(unit);
    setModalOpen(true);
  }

  function handleToggleActive(unit) {
    const nextActive = unit.isActive !== 1;
    setTogglingId(unit.id);
    startToggleTransition(async () => {
      const result = await setUnitActiveAction(companySlug, unit.id, nextActive);
      setTogglingId(null);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t(result.message));
      router.refresh();
    });
  }

  const columns = [
    { key: "name", header: t("name"), sortable: true },
    { key: "code", header: t("code") },
    { key: "type", header: t("type"), render: (unit) => unit.type || "—" },
    {
      key: "isActive",
      header: t("status"),
      render: (unit) => (
        <span
          className={
            unit.isActive === 1
              ? "rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
              : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          }
        >
          {unit.isActive === 1 ? t("active") : t("inactive")}
        </span>
      ),
    },
  ];

  const rowActions = (unit) => [
    { key: "edit", label: t("edit"), icon: Pencil, onClick: () => openEdit(unit) },
    unit.isActive === 1
      ? {
          key: "deactivate",
          label: t("deactivate"),
          icon: Archive,
          variant: "destructive",
          disabled: toggling && togglingId === unit.id,
          onClick: () => handleToggleActive(unit),
        }
      : {
          key: "activate",
          label: t("activate"),
          icon: ArchiveRestore,
          disabled: toggling && togglingId === unit.id,
          onClick: () => handleToggleActive(unit),
        },
  ];

  return (
    <>
      <div className="flex justify-end">
        <Button type="button" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t("createUnit")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialUnits}
          selectable={false}
          rowActions={rowActions}
          emptyIcon={Ruler}
          emptyMessage={t("noUnits")}
          emptyAction={{ label: t("createUnit"), onClick: openCreate }}
        />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingUnit ? t("editUnit") : t("createUnit")}>
        <UnitForm
          companySlug={companySlug}
          unit={editingUnit}
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

function UnitForm({ companySlug, unit, onDone, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(unit ? toFormValues(unit) : EMPTY_FORM);
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
    const result = unit ? await updateUnitAction(companySlug, unit.id, form) : await createUnitAction(companySlug, form);
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
        <Label htmlFor="unit-name">{t("name")}</Label>
        <Input id="unit-name" className="h-11" value={form.name} onChange={(event) => update("name", event.target.value)} />
        {fieldErrors.name?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.name[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="unit-code">{t("code")}</Label>
        <Input id="unit-code" className="h-11" value={form.code} onChange={(event) => update("code", event.target.value)} />
        {fieldErrors.code?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.code[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="unit-type">{t("type")}</Label>
        <Input
          id="unit-type"
          className="h-11"
          value={form.type}
          onChange={(event) => update("type", event.target.value)}
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
