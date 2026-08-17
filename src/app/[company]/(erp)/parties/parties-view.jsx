"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { BookOpen, Check, Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { notify } from "@/lib/toast";
import { cn, decimalToInputValue } from "@/lib/utils";
import { PartyGroupQuickAddForm } from "./party-group-quick-add-form";
import { createPartyAction, deletePartiesAction, updatePartyAction } from "./actions";

const PARTY_TYPES = ["Customer", "Supplier", "Both"];

const EMPTY_FORM = {
  name: "",
  type: "Customer",
  phoneNumber: "",
  address: "",
  panNumber: "",
  partyGroupId: "",
  openingBalance: "0",
  openingBalanceType: "Dr",
};

function toFormValues(party) {
  return {
    name: party.name ?? "",
    type: party.type ?? "Customer",
    phoneNumber: party.phoneNumber ?? "",
    address: party.address ?? "",
    panNumber: party.panNumber ?? "",
    partyGroupId: party.partyGroupId ? String(party.partyGroupId) : "",
    openingBalance: decimalToInputValue(party.openingBalance),
    openingBalanceType: party.openingBalanceType ?? "Dr",
  };
}

export function PartyBalance({ value }) {
  const { t } = useTranslation();
  const amount = Math.abs(Number(value) || 0);
  const isCredit = Number(value) < 0;
  return (
    <span className={cn("font-medium", isCredit ? "text-amber-700 dark:text-amber-500" : "text-foreground")}>
      NPR {amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      <span className="ml-1 text-xs text-muted-foreground">{isCredit ? t("Cr") : t("Dr")}</span>
    </span>
  );
}

/**
 * Reusable list/create/edit shell for the Parties module — the first ERP
 * module page built on the shared DataTable (virtualized + multi-select,
 * see components/ui/data-table.jsx) and the sonner-based toast system
 * (lib/toast.js). Everything else in [company]/(erp)/* follows this same
 * page -> {Module}View -> {Module}Form shape. Row click opens the party's
 * ledger (parties/[party]/page.js) — editing/deleting live in the Actions
 * column instead, since "click row" and "click edit" used to be the same
 * action and that's no longer true now that there's somewhere else for a
 * row click to go.
 */
export default function PartiesView({ companySlug, initialParties, partyGroups }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingParty, setEditingParty] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, startDeleteTransition] = useTransition();

  function openCreate() {
    setEditingParty(null);
    setSheetOpen(true);
  }

  function openEdit(party) {
    setEditingParty(party);
    setSheetOpen(true);
  }

  function openLedger(party) {
    router.push(`/${companySlug}/parties/${party.id}`);
  }

  function handleDeleteOne(party) {
    if (!window.confirm(t("confirmDeleteParties", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deletePartiesAction(companySlug, [party.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("partiesDeleted", { count: result.count }));
      router.refresh();
    });
  }

  function handleBulkDelete(ids, { clearSelection }) {
    const count = ids.size;
    if (!window.confirm(t("confirmDeleteParties", { count }))) return;
    startDeleteTransition(async () => {
      const result = await deletePartiesAction(companySlug, [...ids]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("partiesDeleted", { count: result.count }));
      clearSelection();
      router.refresh();
    });
  }

  const columns = [
    {
      key: "name",
      header: t("name"),
      sortable: true,
      render: (party) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{party.name}</p>
          <p className="truncate text-xs text-muted-foreground">{t(party.type)}</p>
        </div>
      ),
    },
    { key: "phoneNumber", header: t("phone"), render: (party) => party.phoneNumber || "—" },
    { key: "panNumber", header: t("panNumber"), render: (party) => party.panNumber || "—" },
    {
      key: "partyGroupName",
      header: t("partyGroup"),
      render: (party) => party.partyGroupName || t("notSet"),
    },
    {
      key: "balance",
      header: t("balance"),
      sortable: true,
      render: (party) => <PartyBalance value={party.balance} />,
    },
  ];

  const rowActions = (party) => [
    { key: "ledger", label: t("viewLedger"), icon: BookOpen, onClick: () => openLedger(party) },
    { key: "edit", label: t("edit"), icon: Pencil, onClick: () => openEdit(party) },
    { key: "delete", label: t("delete"), icon: Trash2, variant: "destructive", disabled: deleting, onClick: () => handleDeleteOne(party) },
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
          {t("addParty")}
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={initialParties}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onRowClick={openLedger}
          rowActions={rowActions}
          bulkActions={bulkActions}
          filters={[
            {
              key: "partyGroupId",
              label: t("partyGroup"),
              options: partyGroups.map((group) => ({ value: String(group.id), label: group.name })),
            },
          ]}
          emptyIcon={Users}
          emptyMessage={t("noPartiesYet")}
          emptyAction={{ label: t("addParty"), onClick: openCreate }}
        />
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={editingParty ? t("editParty") : t("addParty")}>
        <PartyForm
          companySlug={companySlug}
          party={editingParty}
          partyGroups={partyGroups}
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

export function PartyForm({ companySlug, party, partyGroups, onDone, onClose }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [form, setForm] = useState(party ? toFormValues(party) : EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [groupQuickAdd, setGroupQuickAdd] = useState(null);

  function handleCreatePartyGroup() {
    return new Promise((resolve) => {
      setGroupQuickAdd({ resolve });
    });
  }

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
    const result = party
      ? await updatePartyAction(companySlug, party.id, form)
      : await createPartyAction(companySlug, form);
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
        <Label htmlFor="party-name">{t("partyName")}</Label>
        <Input id="party-name" className="h-11" value={form.name} onChange={(event) => update("name", event.target.value)} />
        {fieldErrors.name?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.name[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>{t("partyType")}</Label>
        <SegmentedControl
          options={PARTY_TYPES.map((type) => ({ value: type, label: t(type) }))}
          value={form.type}
          onChange={(value) => update("type", value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="party-group">{t("partyGroup")}</Label>
        <CreatableSelect
          id="party-group"
          options={partyGroups.map((group) => ({ value: String(group.id), label: group.name }))}
          value={form.partyGroupId}
          onChange={(value) => update("partyGroupId", value)}
          onCreateNew={handleCreatePartyGroup}
          createNewLabel={t("addPartyGroup")}
          placeholder={t("notSet")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="party-phone">{t("phone")}</Label>
        <Input
          id="party-phone"
          className="h-11"
          value={form.phoneNumber}
          onChange={(event) => update("phoneNumber", event.target.value)}
        />
        {fieldErrors.phoneNumber?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.phoneNumber[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="party-pan">{t("panNumber")}</Label>
        <Input
          id="party-pan"
          className="h-11"
          value={form.panNumber}
          onChange={(event) => update("panNumber", event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="party-address">{t("organizationAddress")}</Label>
        <Input
          id="party-address"
          className="h-11"
          value={form.address}
          onChange={(event) => update("address", event.target.value)}
        />
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3 sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="party-opening-balance">{t("openingBalance")}</Label>
          <Input
            id="party-opening-balance"
            type="number"
            className="h-11"
            value={form.openingBalance}
            onChange={(event) => update("openingBalance", event.target.value)}
          />
          {fieldErrors.openingBalance?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.openingBalance[0])}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>{t("balanceType")}</Label>
          <SegmentedControl
            options={[
              { value: "Dr", label: "Dr" },
              { value: "Cr", label: "Cr" },
            ]}
            value={form.openingBalanceType}
            onChange={(value) => update("openingBalanceType", value)}
          />
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

      {groupQuickAdd && (
        <Modal
          open
          onClose={() => {
            groupQuickAdd.resolve(null);
            setGroupQuickAdd(null);
          }}
          title={t("addPartyGroup")}
        >
          <PartyGroupQuickAddForm
            companySlug={companySlug}
            onCancel={() => {
              groupQuickAdd.resolve(null);
              setGroupQuickAdd(null);
            }}
            onCreated={(result) => {
              groupQuickAdd.resolve(result);
              setGroupQuickAdd(null);
              router.refresh();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
