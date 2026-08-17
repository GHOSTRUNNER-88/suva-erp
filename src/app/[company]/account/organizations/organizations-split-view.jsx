"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Banknote,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Pencil,
  Settings,
  ShieldCheck,
  Store,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { cn, pickLocalized } from "@/lib/utils";
import { INDUSTRY_OPTIONS, translateFeature, translateIndustry } from "@/lib/organization/options";
import { DEFAULT_MODULE_KEYS, MODULE_CATALOG, parseModuleList } from "@/lib/modules";
import { getPurchasedModules } from "../modules/actions";
import {
  addOrganizationUserAction,
  getOrganizationDetail,
  listOrganizationUsers,
  updateOrganizationAction,
  updateOrganizationModulesAction,
  updateOrganizationUserAction,
} from "./actions";

function parseFeatures(value) {
  if (!value) return [];
  try {
    const features = JSON.parse(value);
    return Array.isArray(features) ? features : [];
  } catch {
    return [];
  }
}

function formatDate(t, value) {
  return value ? new Intl.DateTimeFormat("en-CA").format(new Date(value)) : t("notSet");
}

function toEditForm(detail) {
  return {
    name: detail.name ?? "",
    industry: detail.industry ?? "",
    address: detail.address ?? "",
    email: detail.email ?? "",
    phoneNumber: detail.phoneNumber ?? "",
    panNumber: detail.panNumber ?? "",
    website: detail.website ?? "",
    isVatRegistered: detail.isVatRegistered === 1 || detail.isVatRegistered === true,
  };
}

const TABS = [
  { key: "overview", labelKey: "overview", icon: Building2 },
  { key: "modules", labelKey: "organizationModules", icon: Store },
  { key: "settings", labelKey: "settings", icon: Settings },
  { key: "users", labelKey: "users", icon: Users },
];

/**
 * Firebase-console-style master/detail: organizations render as a card
 * list (mirroring Firebase's "Projects" list) — clicking one animates the
 * list into a compact column on the left while a detail panel slides in
 * from the right with Overview/Settings/Users tabs, instead of a full page
 * navigation. Settings is a real editable form (updateOrganizationAction);
 * Add User opens as an off-canvas Sheet instead of navigating to a
 * separate page — the invite itself still can't actually be *sent* (see
 * the notice in the sheet — that needs a schema change, not built here).
 */
export function OrganizationsSplitView({ companySlug, organizations }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith("ne") ? "ne" : "en";
  const router = useRouter();
  const [activeId, setActiveId] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [detail, setDetail] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveFieldErrors, setSaveFieldErrors] = useState({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [purchasedModules, setPurchasedModules] = useState([]);
  const [moduleSelection, setModuleSelection] = useState([]);
  const [savingModules, setSavingModules] = useState(false);
  const [modulesSaved, setModulesSaved] = useState(false);

  useEffect(() => {
    // Company-wide, not per-organization — fetched once, not inside the
    // activeId effect below.
    getPurchasedModules(companySlug).then(setPurchasedModules);
  }, [companySlug]);

  useEffect(() => {
    if (!activeId) {
      // Panel unmounts via AnimatePresence whenever activeId is null, so
      // stale detail/users just sit unrendered until the next org opens
      // and this effect repopulates them below — no need to clear them.
      return;
    }
    let cancelled = false;
    // Standard fetch-on-id-change effect — setLoading(true) here (not in a
    // callback) is what actually shows the spinner the instant a different
    // organization is clicked, before the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    Promise.all([
      getOrganizationDetail(companySlug, activeId),
      listOrganizationUsers(companySlug, activeId),
    ]).then(([detailRow, userRows]) => {
      if (cancelled) return;
      setDetail(detailRow);
      setEditForm(detailRow ? toEditForm(detailRow) : null);
      // Default modules are always on and aren't part of this editable
      // selection — only the optional ones the org has chosen to enable.
      setModuleSelection(
        detailRow ? parseModuleList(detailRow.enabledModules).filter((key) => !DEFAULT_MODULE_KEYS.includes(key)) : []
      );
      setUsers(userRows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId, companySlug]);

  function openOrganization(id) {
    setActiveId(id);
    setActiveTab("overview");
    setEditing(false);
    setSaveSuccess(false);
    setModulesSaved(false);
  }

  function close() {
    setActiveId(null);
    setEditing(false);
  }

  async function refreshUsers() {
    const userRows = await listOrganizationUsers(companySlug, activeId);
    setUsers(userRows);
  }

  function startEditing() {
    setEditForm(toEditForm(detail));
    setSaveError(null);
    setSaveFieldErrors({});
    setSaveSuccess(false);
    setEditing(true);
  }

  function updateField(field, value) {
    setEditForm((current) => ({ ...current, [field]: value }));
  }

  function saveSettings() {
    setSaving(true);
    setSaveError(null);
    setSaveFieldErrors({});
    startTransitionSave();
  }

  async function startTransitionSave() {
    const result = await updateOrganizationAction(companySlug, activeId, editForm);
    setSaving(false);
    if (result && !result.ok) {
      setSaveError(result.formError ? t(result.formError) : null);
      setSaveFieldErrors(result.fieldErrors ?? {});
      return;
    }
    // Re-fetch rather than merging editForm into local state — the save
    // just computed fresh nameNe/addressNe server-side (translate-on-write,
    // see actions.js) and editForm doesn't carry those, so merging would
    // leave the Nepali display stuck on the pre-edit translation.
    const refreshed = await getOrganizationDetail(companySlug, activeId);
    if (refreshed) setDetail(refreshed);
    setEditing(false);
    setSaveSuccess(true);
    router.refresh();
  }

  function toggleModule(moduleKey) {
    setModulesSaved(false);
    setModuleSelection((current) =>
      current.includes(moduleKey) ? current.filter((key) => key !== moduleKey) : [...current, moduleKey]
    );
  }

  function saveModules() {
    setSavingModules(true);
    startModuleSave();
  }

  async function startModuleSave() {
    const result = await updateOrganizationModulesAction(companySlug, activeId, moduleSelection);
    setSavingModules(false);
    if (result?.ok) {
      setModuleSelection(result.enabledModules);
      setModulesSaved(true);
      router.refresh();
    }
  }

  const features = parseFeatures(detail?.enabledFeatures);
  // Default modules always count as purchased, even for a company row that
  // predates this bundling and never got its purchasedModules backfilled —
  // mirrors the same defensiveness in module-store-view.jsx.
  const effectivePurchasedModules = [...new Set([...purchasedModules, ...DEFAULT_MODULE_KEYS])];
  // Default modules are always on and never shown as a choice here — only
  // the purchased optional add-ons (payroll, maskebari, ...) are toggleable.
  const optionalPurchasedModules = MODULE_CATALOG.filter(
    (module) => !module.default && effectivePurchasedModules.includes(module.key)
  );
  const enabledModules = parseModuleList(detail?.enabledModules);
  const activeUsersCount = users.filter((user) => user.organizationStatus === "active").length;

  function openEditUser(user) {
    setEditingUser(user);
    setEditUserOpen(true);
  }

  return (
    <div className="flex gap-5">
      <motion.div layout transition={{ duration: 0.25, ease: "easeOut" }} className={cn("min-w-0", activeId ? "w-full max-w-xs shrink-0" : "flex-1")}>
        <div className={cn("grid gap-3", activeId ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3")}>
          {organizations.map((organization) => {
            const orgFeatures = parseFeatures(organization.enabledFeatures);
            return (
              <motion.button
                layout
                key={organization.id}
                type="button"
                onClick={() => openOrganization(organization.id)}
                className={cn(
                  "rounded-xl border bg-background p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5",
                  activeId === organization.id && "border-primary bg-primary/8 shadow-[inset_3px_0_0_var(--primary)]"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{pickLocalized(language, organization.name, organization.nameNe)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {translateIndustry(t, organization.industry) || t("industryNotSet")}
                      </span>
                    </span>
                  </div>
                  {organization.isDefault && !activeId && (
                    <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                      {t("main")}
                    </span>
                  )}
                </div>
                {!activeId && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{organization.userSummary.active} {t("active").toLowerCase()} {t("users").toLowerCase()}</span>
                    <span>·</span>
                    <span>{orgFeatures.length ? t("featuresEnabledCount", { count: orgFeatures.length }) : t("basicAccounting")}</span>
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      <AnimatePresence>
        {activeId && (
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="min-w-0 flex-1 overflow-hidden rounded-xl border bg-background"
          >
            {loading || !detail ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">{pickLocalized(language, detail.name, detail.nameNe)}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {translateIndustry(t, detail.industry) || t("industryNotSet")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="icon" onClick={close} aria-label={t("close")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex gap-1 border-b px-5 py-2">
                  {TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => {
                          setActiveTab(tab.key);
                          setEditing(false);
                        }}
                        className={cn(
                          "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                          activeTab === tab.key
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {t(tab.labelKey)}
                      </button>
                    );
                  })}
                </div>

                <div className="p-5">
                  {activeTab === "overview" && (
                    <dl className="grid gap-3 text-sm md:grid-cols-2">
                      {[
                        [t("organizationAddress"), pickLocalized(language, detail.address, detail.addressNe) || t("notSet")],
                        [t("email"), detail.email || t("notSet")],
                        [t("panNumber"), detail.panNumber || t("notSet")],
                        [t("website"), detail.website || t("notSet")],
                        [t("registeredWithVat"), detail.isVatRegistered ? t("yes") : t("no")],
                        [t("accountingStartDate"), `${t("ad")} ${formatDate(t, detail.accountingStartDate)} / ${t("bsPending")}`],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4 border-b pb-2">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="text-right font-medium">{value}</dd>
                        </div>
                      ))}
                      <div className="md:col-span-2">
                        <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">{t("enabledFeatures")}</p>
                        <div className="flex flex-wrap gap-2">
                          {features.length ? (
                            features.map((feature) => (
                              <span key={feature} className="rounded-md border bg-muted/40 px-2 py-1 text-xs font-medium">
                                {translateFeature(t, feature)}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">{t("basicAccountingOnly")}</span>
                          )}
                        </div>
                      </div>
                    </dl>
                  )}

                  {activeTab === "modules" && (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">{t("organizationModulesHint")}</p>

                      <div className="rounded-xl border bg-muted/30 p-3">
                        <p className="text-xs font-medium text-muted-foreground">{t("defaultModulesIncluded")}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {DEFAULT_MODULE_KEYS.map((key) => {
                            const catalogEntry = MODULE_CATALOG.find((item) => item.key === key);
                            return (
                              <span key={key} className="rounded-md bg-background px-2 py-1 text-xs font-medium">
                                {t(catalogEntry.labelKey)}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {modulesSaved && (
                        <Alert>
                          <AlertDescription>{t("orgUpdated")}</AlertDescription>
                        </Alert>
                      )}
                      {optionalPurchasedModules.length === 0 ? (
                        <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                          <p className="text-muted-foreground">{t("noModulesPurchased")}</p>
                          <Link
                            href={`/${companySlug}/account/modules`}
                            className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
                          >
                            {t("goToModuleStore")}
                          </Link>
                        </div>
                      ) : (
                        <>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {optionalPurchasedModules.map((module) => {
                              const Icon = module.icon;
                              const checked = moduleSelection.includes(module.key);
                              return (
                                <button
                                  key={module.key}
                                  type="button"
                                  onClick={() => toggleModule(module.key)}
                                  className={cn(
                                    "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                                    checked ? "border-primary bg-primary/8" : "bg-background hover:bg-muted/40"
                                  )}
                                >
                                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                                    <Icon className="h-4 w-4" />
                                  </span>
                                  <span className="flex-1 text-sm font-medium">{t(module.labelKey)}</span>
                                  <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md", checked ? "bg-primary text-primary-foreground" : "bg-muted")}>
                                    {checked && <Check className="h-3.5 w-3.5" />}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="flex justify-end border-t pt-4">
                            <Button type="button" onClick={saveModules} disabled={savingModules}>
                              {savingModules ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                              {savingModules ? t("saving") : t("saveChanges")}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {activeTab === "settings" && (
                    <div className="space-y-4">
                      {saveSuccess && !editing && (
                        <Alert>
                          <AlertDescription>{t("orgUpdated")}</AlertDescription>
                        </Alert>
                      )}

                      <div className="overflow-hidden rounded-xl border">
                        <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-primary" />
                            <p className="text-sm font-semibold">{t("general")}</p>
                          </div>
                          {!editing && (
                            <Button type="button" variant="outline" size="sm" onClick={startEditing}>
                              <Pencil className="h-3.5 w-3.5" />
                              {t("editSettings")}
                            </Button>
                          )}
                        </div>

                        {!editing && (
                          <dl className="grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2">
                            {[
                              [t("organizationName"), pickLocalized(language, detail.name, detail.nameNe)],
                              [t("industry"), translateIndustry(t, detail.industry) || t("notSet")],
                              [t("panNumber"), detail.panNumber || t("notSet")],
                              [t("vatRegistered"), detail.isVatRegistered ? t("yes") : t("no")],
                              [t("email"), detail.email || t("notSet")],
                              [t("phone"), detail.phoneNumber || t("notSet")],
                              [t("website"), detail.website || t("notSet")],
                            ].map(([label, value]) => (
                              <div key={label} className="flex items-center justify-between gap-4 border-b pb-2 last:border-b-0 sm:last:border-b">
                                <dt className="text-muted-foreground">{label}</dt>
                                <dd className="truncate text-right font-medium">{value}</dd>
                              </div>
                            ))}
                            <div className="flex items-center justify-between gap-4 border-b pb-2 sm:col-span-2 sm:border-b-0">
                              <dt className="text-muted-foreground">{t("organizationAddress")}</dt>
                              <dd className="text-right font-medium">{pickLocalized(language, detail.address, detail.addressNe) || t("notSet")}</dd>
                            </div>
                          </dl>
                        )}

                        {editing && editForm && (
                          <div className="space-y-4 p-4">
                            {saveError && (
                              <Alert variant="destructive">
                                <AlertDescription>{saveError}</AlertDescription>
                              </Alert>
                            )}
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label htmlFor="edit-name">{t("organizationName")}</Label>
                                <Input id="edit-name" className="h-11" value={editForm.name} onChange={(event) => updateField("name", event.target.value)} disabled={saving} />
                                {saveFieldErrors.name?.[0] && <p className="text-xs text-destructive">{t(saveFieldErrors.name[0])}</p>}
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="edit-industry">{t("industry")}</Label>
                                <Combobox
                                  id="edit-industry"
                                  options={INDUSTRY_OPTIONS}
                                  value={editForm.industry}
                                  onChange={(next) => updateField("industry", next)}
                                  placeholder={t("selectIndustry")}
                                />
                                {saveFieldErrors.industry?.[0] && <p className="text-xs text-destructive">{t(saveFieldErrors.industry[0])}</p>}
                              </div>

                              <div className="space-y-1.5 sm:col-span-2">
                                <Label htmlFor="edit-address">{t("organizationAddress")}</Label>
                                <Input id="edit-address" className="h-11" value={editForm.address} onChange={(event) => updateField("address", event.target.value)} disabled={saving} />
                                {saveFieldErrors.address?.[0] && <p className="text-xs text-destructive">{t(saveFieldErrors.address[0])}</p>}
                              </div>

                              <div className="space-y-1.5">
                                <Label htmlFor="edit-email">{t("email")}</Label>
                                <Input id="edit-email" type="email" className="h-11" value={editForm.email} onChange={(event) => updateField("email", event.target.value)} disabled={saving} />
                                {saveFieldErrors.email?.[0] && <p className="text-xs text-destructive">{t(saveFieldErrors.email[0])}</p>}
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="edit-phone">{t("phone")}</Label>
                                <Input id="edit-phone" className="h-11" value={editForm.phoneNumber} onChange={(event) => updateField("phoneNumber", event.target.value)} disabled={saving} />
                                {saveFieldErrors.phoneNumber?.[0] && <p className="text-xs text-destructive">{t(saveFieldErrors.phoneNumber[0])}</p>}
                              </div>

                              <div className="space-y-1.5">
                                <Label htmlFor="edit-pan">{t("panNumber")}</Label>
                                <Input id="edit-pan" className="h-11" value={editForm.panNumber} onChange={(event) => updateField("panNumber", event.target.value)} disabled={saving} />
                                {saveFieldErrors.panNumber?.[0] && <p className="text-xs text-destructive">{t(saveFieldErrors.panNumber[0])}</p>}
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="edit-website">{t("website")}</Label>
                                <Input id="edit-website" className="h-11" value={editForm.website} onChange={(event) => updateField("website", event.target.value)} disabled={saving} />
                                {saveFieldErrors.website?.[0] && <p className="text-xs text-destructive">{t(saveFieldErrors.website[0])}</p>}
                              </div>

                              <div className="space-y-1.5 sm:col-span-2">
                                <Label>{t("registeredWithVat")}</Label>
                                <SegmentedControl
                                  className="sm:max-w-xs"
                                  options={[
                                    { value: true, label: t("yes") },
                                    { value: false, label: t("no") },
                                  ]}
                                  value={editForm.isVatRegistered}
                                  onChange={(value) => updateField("isVatRegistered", value)}
                                />
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 border-t pt-4">
                              <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                                {t("cancel")}
                              </Button>
                              <Button type="button" onClick={saveSettings} disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                {saving ? t("saving") : t("saveChanges")}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {!editing && (
                        <div className="grid gap-4 sm:grid-cols-2">
                          {[
                            [Banknote, t("accounting"), [
                              [t("defaultCurrency"), features.includes("multiCurrency") ? t("nprMultiCurrency") : "NPR"],
                            ]],
                            [ShieldCheck, t("access"), [
                              [t("defaultInvitedRole"), t("member")],
                              [t("allowedLogin"), `/${companySlug}/login`],
                            ]],
                          ].map(([Icon, title, rows]) => (
                            <div key={title} className="rounded-xl border p-4">
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4 text-primary" />
                                <p className="text-sm font-semibold">{title}</p>
                              </div>
                              <dl className="mt-3 space-y-2 text-sm">
                                {rows.map(([label, value]) => (
                                  <div key={label} className="flex justify-between gap-4">
                                    <dt className="text-muted-foreground">{label}</dt>
                                    <dd className="font-medium">{value}</dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "users" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          {t("totalUsersCount", { count: users.length })}
                        </p>
                        <Button type="button" size="sm" onClick={() => setAddUserOpen(true)}>
                          <UserPlus className="h-3.5 w-3.5" />
                          {t("addUser")}
                        </Button>
                      </div>
                      {users.map((user) => {
                        const userModules = parseModuleList(user.modulePermissions);
                        return (
                          <div key={user.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <span
                                  className={cn(
                                    "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                                    user.organizationRole === "owner" && "bg-primary/12 text-primary",
                                    user.organizationRole === "admin" && "bg-blue-600/10 text-blue-700 dark:text-blue-400",
                                    user.organizationRole === "member" && "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {user.organizationRole === "admin" ? t("orgRoleAdminBadge") : t(user.organizationRole)}
                                </span>
                                {user.organizationRole === "member" && (
                                  <span className="truncate text-[11px] text-muted-foreground">
                                    {userModules.length
                                      ? userModules
                                          .map((key) => t(MODULE_CATALOG.find((module) => module.key === key)?.labelKey))
                                          .join(", ")
                                      : t("noModuleAccess")}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {user.organizationStatus === "active" && (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              )}
                              {user.organizationRole !== "owner" && (
                                <button
                                  type="button"
                                  onClick={() => openEditUser(user)}
                                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                                  aria-label={t("editUser")}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <Link
                                href={`mailto:${user.email}`}
                                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                                aria-label={t("email")}
                              >
                                <Mail className="h-3.5 w-3.5" />
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                      {activeUsersCount === 0 && users.length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">{t("notSet")}</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={addUserOpen} onClose={() => setAddUserOpen(false)} title={t("addUser")}>
        <AddUserForm
          companySlug={companySlug}
          organizationId={activeId}
          organizationName={detail?.name}
          enabledModules={enabledModules}
          onDone={async () => {
            await refreshUsers();
            setAddUserOpen(false);
          }}
          onClose={() => setAddUserOpen(false)}
        />
      </Sheet>

      <Sheet open={editUserOpen} onClose={() => setEditUserOpen(false)} title={t("editUser")}>
        {editingUser && (
          <EditUserForm
            companySlug={companySlug}
            organizationId={activeId}
            user={editingUser}
            enabledModules={enabledModules}
            onDone={async () => {
              await refreshUsers();
              setEditUserOpen(false);
            }}
            onClose={() => setEditUserOpen(false)}
          />
        )}
      </Sheet>
    </div>
  );
}

function ModulePermissionPicker({ enabledModules, value, onChange, disabled }) {
  const { t } = useTranslation();
  const availableModules = MODULE_CATALOG.filter((module) => enabledModules.includes(module.key));

  function toggle(moduleKey) {
    onChange(value.includes(moduleKey) ? value.filter((key) => key !== moduleKey) : [...value, moduleKey]);
  }

  if (availableModules.length === 0) {
    return <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">{t("noModulesEnabledYet")}</p>;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {availableModules.map((module) => {
        const checked = value.includes(module.key);
        return (
          <button
            key={module.key}
            type="button"
            disabled={disabled}
            onClick={() => toggle(module.key)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50",
              checked ? "border-primary bg-primary/8" : "hover:bg-muted/50"
            )}
          >
            <span
              className={cn(
                "grid h-4 w-4 shrink-0 place-items-center rounded border",
                checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
              )}
            >
              {checked && <Check className="h-3 w-3" />}
            </span>
            <span className="truncate">{t(module.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

const NEW_USER_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phoneNumber: "",
  password: "",
  role: "member",
  mode: "password",
  modulePermissions: [],
};

function AddUserForm({ companySlug, organizationId, organizationName, enabledModules, onDone, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(NEW_USER_FORM);
  const [showPassword, setShowPassword] = useState(false);
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
    const result = await addOrganizationUserAction(companySlug, organizationId, form);
    setPending(false);
    if (result && !result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    setForm(NEW_USER_FORM);
    onDone();
  }

  const isInvite = form.mode === "invite";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {organizationName ? t("addUserHint", { name: organizationName }) : null}
      </p>
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label>{t("addUser")}</Label>
        <SegmentedControl
          options={[
            { value: "password", label: t("addUserModePassword") },
            { value: "invite", label: t("addUserModeInvite") },
          ]}
          value={form.mode}
          onChange={(value) => update("mode", value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="invite-firstName">{t("firstName")}</Label>
          <Input id="invite-firstName" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} className="h-11" disabled={pending} />
          {fieldErrors.firstName?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.firstName[0])}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-lastName">{t("lastName")}</Label>
          <Input id="invite-lastName" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} className="h-11" disabled={pending} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-email">{t("email")}</Label>
        <Input id="invite-email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} className="h-11" placeholder="name@company.com" disabled={pending} />
        {fieldErrors.email?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.email[0])}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-phone">{t("phone")}</Label>
        <Input id="invite-phone" value={form.phoneNumber} onChange={(event) => update("phoneNumber", event.target.value)} className="h-11" disabled={pending} />
      </div>

      {!isInvite && (
        <div className="space-y-2">
          <Label htmlFor="invite-password">{t("password")}</Label>
          <div className="relative">
            <Input
              id="invite-password"
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(event) => update("password", event.target.value)}
              className="h-11 pr-9"
              disabled={pending}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.password?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.password[0])}</p>}
        </div>
      )}

      <div className="space-y-2">
        <Label>{t("role")}</Label>
        <SegmentedControl
          options={[
            { value: "member", label: t("member") },
            { value: "admin", label: t("orgRoleAdminBadge") },
          ]}
          value={form.role}
          onChange={(value) => update("role", value)}
        />
        <p className="text-xs text-muted-foreground">
          {form.role === "admin" ? t("orgRoleAdminHint") : t("orgRoleMemberHint")}
        </p>
      </div>

      {form.role === "member" && (
        <div className="space-y-2">
          <Label>{t("moduleAccess")}</Label>
          <ModulePermissionPicker
            enabledModules={enabledModules}
            value={form.modulePermissions}
            onChange={(value) => update("modulePermissions", value)}
            disabled={pending}
          />
        </div>
      )}

      <div className="rounded-lg border bg-amber-600/10 p-3 text-xs text-amber-800">
        {isInvite ? t("emailInviteHint") : t("setPasswordHint")}
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          {t("back")}
        </Button>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isInvite ? (pending ? t("sendingInvite") : t("sendInvite")) : (pending ? t("creatingUser") : t("createUser"))}
        </Button>
      </div>
    </div>
  );
}

function EditUserForm({ companySlug, organizationId, user, enabledModules, onDone, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    phoneNumber: user.phoneNumber ?? "",
    role: user.organizationRole === "admin" ? "admin" : "member",
    modulePermissions: parseModuleList(user.modulePermissions),
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
    const result = await updateOrganizationUserAction(companySlug, organizationId, user.id, form);
    setPending(false);
    if (result && !result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label>{t("email")}</Label>
        <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">{user.email}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit-user-firstName">{t("firstName")}</Label>
          <Input
            id="edit-user-firstName"
            value={form.firstName}
            onChange={(event) => update("firstName", event.target.value)}
            className="h-11"
            disabled={pending}
          />
          {fieldErrors.firstName?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.firstName[0])}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-user-lastName">{t("lastName")}</Label>
          <Input
            id="edit-user-lastName"
            value={form.lastName}
            onChange={(event) => update("lastName", event.target.value)}
            className="h-11"
            disabled={pending}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-user-phone">{t("phone")}</Label>
        <Input
          id="edit-user-phone"
          value={form.phoneNumber}
          onChange={(event) => update("phoneNumber", event.target.value)}
          className="h-11"
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label>{t("role")}</Label>
        <SegmentedControl
          options={[
            { value: "member", label: t("member") },
            { value: "admin", label: t("orgRoleAdminBadge") },
          ]}
          value={form.role}
          onChange={(value) => update("role", value)}
        />
        <p className="text-xs text-muted-foreground">
          {form.role === "admin" ? t("orgRoleAdminHint") : t("orgRoleMemberHint")}
        </p>
      </div>

      {form.role === "member" && (
        <div className="space-y-2">
          <Label>{t("moduleAccess")}</Label>
          <ModulePermissionPicker
            enabledModules={enabledModules}
            value={form.modulePermissions}
            onChange={(value) => update("modulePermissions", value)}
            disabled={pending}
          />
        </div>
      )}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          {t("back")}
        </Button>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {pending ? t("saving") : t("saveChanges")}
        </Button>
      </div>
    </div>
  );
}
