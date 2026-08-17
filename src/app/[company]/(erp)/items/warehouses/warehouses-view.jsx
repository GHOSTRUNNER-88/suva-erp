"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Check, Loader2, Pencil, Plus, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { createWarehouseAction, deleteWarehousesAction, updateWarehouseAction } from "../actions";

const WAREHOUSE_TYPES = ["Godown", "Retail Store", "Wholesale Store", "Assembly Plant", "Others"];

function toFormValues(warehouse) {
  return {
    name: warehouse.name ?? "",
    type: warehouse.type ?? "Godown",
    phoneNumber: warehouse.phoneNumber ?? "",
    storeAddress: warehouse.storeAddress ?? "",
    isPrimary: warehouse.isPrimary === 1,
    invoicePrefix: warehouse.invoicePrefix ?? "",
  };
}

export default function WarehousesView({ companySlug, initialWarehouses }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, startDeleteTransition] = useTransition();

  function openCreate() {
    setEditingWarehouse(null);
    setSheetOpen(true);
  }

  function openEdit(warehouse) {
    setEditingWarehouse(warehouse);
    setSheetOpen(true);
  }

  function handleDeleteOne(warehouse) {
    if (!window.confirm(t("confirmDeleteWarehouses", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deleteWarehousesAction(companySlug, [warehouse.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("warehousesDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeleteWarehouses", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deleteWarehousesAction(companySlug, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("warehousesDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [
    {
      key: "name",
      header: t("warehouseName"),
      sortable: true,
      render: (warehouse) => (
        <div className="flex min-w-0 items-center gap-2">
          {warehouse.isPrimary === 1 && (
            <span
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"
            title={t("primaryWarehouse")}
            aria-label={t("primaryWarehouse")}
            >
              <BadgeCheck className="h-3.5 w-3.5" />
            </span>
          )}
          <p className="truncate font-medium">{warehouse.name}</p>
        </div>
      ),
    },
    { key: "type", header: t("warehouseType"), render: (warehouse) => t(warehouse.type) },
    { key: "phoneNumber", header: t("phone") },
    { key: "storeAddress", header: t("storeAddress"), render: (warehouse) => warehouse.storeAddress || "—" },
    { key: "invoicePrefix", header: t("invoicePrefix"), render: (warehouse) => warehouse.invoicePrefix || "—" },
  ];

  const rowActions = (warehouse) => [
    { key: "edit", label: t("edit"), icon: Pencil, onClick: () => openEdit(warehouse) },
    {
      key: "delete",
      label: t("delete"),
      icon: Trash2,
      variant: "destructive",
      disabled: deleting,
      onClick: () => handleDeleteOne(warehouse),
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
          {t("addWarehouse")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialWarehouses}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          rowActions={rowActions}
          bulkActions={bulkActions}
          filters={[
            {
              key: "type",
              label: t("warehouseType"),
              options: WAREHOUSE_TYPES.map((type) => ({ value: type, label: t(type) })),
            },
          ]}
          emptyIcon={WarehouseIcon}
          emptyMessage={t("noWarehousesYet")}
          emptyAction={{ label: t("addWarehouse"), onClick: openCreate }}
        />
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editingWarehouse ? t("editWarehouse") : t("addWarehouse")}
      >
        <WarehouseForm
          companySlug={companySlug}
          warehouse={editingWarehouse}
          isFirstWarehouse={initialWarehouses.length === 0}
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

function WarehouseForm({ companySlug, warehouse, isFirstWarehouse, onDone, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(
    warehouse
      ? toFormValues(warehouse)
      : {
          name: "",
          type: "Godown",
          phoneNumber: "",
          storeAddress: "",
          // The very first warehouse in an org has nothing to be "not
          // primary" relative to — default it on instead of making every
          // new org immediately fix an empty "no primary warehouse" state.
          isPrimary: isFirstWarehouse,
          invoicePrefix: "",
        }
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
    const result = warehouse
      ? await updateWarehouseAction(companySlug, warehouse.id, form)
      : await createWarehouseAction(companySlug, form);
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
        <Label htmlFor="warehouse-name">{t("warehouseName")}</Label>
        <Input
          id="warehouse-name"
          className="h-11"
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
        />
        {fieldErrors.name?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.name[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>{t("warehouseType")}</Label>
        <SegmentedControl
          wrap
          options={WAREHOUSE_TYPES.map((type) => ({ value: type, label: t(type) }))}
          value={form.type}
          onChange={(value) => update("type", value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="warehouse-phone">{t("phone")}</Label>
        <Input
          id="warehouse-phone"
          className="h-11"
          value={form.phoneNumber}
          onChange={(event) => update("phoneNumber", event.target.value)}
        />
        {fieldErrors.phoneNumber?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.phoneNumber[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="warehouse-address">{t("storeAddress")}</Label>
        <Input
          id="warehouse-address"
          className="h-11"
          value={form.storeAddress}
          onChange={(event) => update("storeAddress", event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="warehouse-invoice-prefix">{t("invoicePrefix")}</Label>
        <Input
          id="warehouse-invoice-prefix"
          className="h-11 uppercase"
          value={form.invoicePrefix}
          onChange={(event) => update("invoicePrefix", event.target.value)}
          placeholder="INV"
        />
        <p className="text-xs text-muted-foreground">{t("invoicePrefixHint")}</p>
      </div>

      <div className="space-y-1.5">
        <Label>{t("primaryWarehouse")}</Label>
        <SegmentedControl
          options={[
            { value: true, label: t("yes") },
            { value: false, label: t("no") },
          ]}
          value={form.isPrimary}
          onChange={(value) => update("isPrimary", value)}
        />
        <p className={cn("text-xs text-muted-foreground")}>{t("primaryWarehouseHint")}</p>
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
