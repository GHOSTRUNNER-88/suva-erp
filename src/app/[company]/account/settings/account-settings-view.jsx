"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Mail, Pencil, ShieldCheck, UserRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateAccountProfileAction } from "./actions";

function toEditForm(user) {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    phoneNumber: user.phoneNumber ?? "",
  };
}

export function AccountSettingsView({ companySlug, company, user }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [current, setCurrent] = useState(user);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => toEditForm(user));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  function startEditing() {
    setForm(toEditForm(current));
    setSaveError(null);
    setFieldErrors({});
    setSaveSuccess(false);
    setEditing(true);
  }

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function save() {
    setSaving(true);
    setSaveError(null);
    setFieldErrors({});
    startSave();
  }

  async function startSave() {
    const result = await updateAccountProfileAction(companySlug, form);
    setSaving(false);
    if (result && !result.ok) {
      setSaveError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    setCurrent((prev) => ({ ...prev, ...form }));
    setEditing(false);
    setSaveSuccess(true);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b bg-[linear-gradient(135deg,rgba(247,181,0,0.12),rgba(14,165,233,0.06),transparent)] px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/12 text-primary">
              <UserRound className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{t("accountSettings")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("accountSettingsSubtitle")}</p>
            </div>
          </div>
          {!editing && (
            <Button type="button" variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="h-3.5 w-3.5" />
              {t("editSettings")}
            </Button>
          )}
        </div>

        {saveSuccess && !editing && (
          <div className="px-5 pt-4">
            <Alert>
              <AlertDescription>{t("profileUpdated")}</AlertDescription>
            </Alert>
          </div>
        )}

        {!editing && (
          <div className="grid gap-px bg-border md:grid-cols-2">
            {[
              [t("name"), `${current.firstName} ${current.lastName || ""}`.trim()],
              [t("phone"), current.phoneNumber || t("notSet")],
              [t("email"), current.email],
              [t("role"), t(current.role)],
              [t("workspaceUrl"), `/${company}`],
            ].map(([label, value]) => (
              <div key={label} className="bg-background p-5">
                <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
                <p className="mt-1 font-medium">{value}</p>
              </div>
            ))}
          </div>
        )}

        {editing && (
          <div className="space-y-4 p-5">
            {saveError && (
              <Alert variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="profile-firstName">{t("firstName")}</Label>
                <Input id="profile-firstName" className="h-11" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} disabled={saving} />
                {fieldErrors.firstName?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.firstName[0])}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-lastName">{t("lastName")}</Label>
                <Input id="profile-lastName" className="h-11" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} disabled={saving} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="profile-phone">{t("phone")}</Label>
                <Input id="profile-phone" className="h-11" value={form.phoneNumber} onChange={(event) => update("phoneNumber", event.target.value)} disabled={saving} />
                {fieldErrors.phoneNumber?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.phoneNumber[0])}</p>}
              </div>
            </div>
            <div className="grid gap-4 rounded-xl border bg-muted/30 p-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">{t("email")}</p>
                <p className="mt-1 font-medium">{current.email}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">{t("role")}</p>
                <p className="mt-1 font-medium">{t(current.role)}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                {t("cancel")}
              </Button>
              <Button type="button" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {saving ? t("saving") : t("saveChanges")}
              </Button>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border bg-background p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">{t("security")}</h2>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{t("securityHint")}</p>
        </section>

        <section className="rounded-2xl border bg-background p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">{t("contact")}</h2>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{t("contactHint")}</p>
        </section>
      </div>
    </div>
  );
}
