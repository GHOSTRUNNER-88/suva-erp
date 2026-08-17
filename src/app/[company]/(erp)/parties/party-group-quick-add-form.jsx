"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPartyGroupAction } from "./actions";

/**
 * Quick-add form for a Party Group, opened from CreatableSelect's pinned
 * "+ Add Group" row (see components/ui/creatable-select.jsx's
 * onCreateNew) — used both from the Party form's own group picker and from
 * the Items form's party-group pricing rows, so it lives here rather than
 * inside either *-view.jsx.
 */
export function PartyGroupQuickAddForm({ companySlug, onCreated, onCancel }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: "", description: "" });
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit() {
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    const result = await createPartyGroupAction(companySlug, form);
    setPending(false);
    if (!result.ok) {
      setFormError(result.formError ? t(result.formError) : null);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onCreated({ value: String(result.id), label: result.name });
  }

  return (
    <div className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="quick-group-name">{t("partyGroupName")}</Label>
        <Input
          id="quick-group-name"
          className="h-11"
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
        />
        {fieldErrors.name?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.name[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="quick-group-description">{t("description")}</Label>
        <Input
          id="quick-group-description"
          className="h-11"
          value={form.description}
          onChange={(event) => update("description", event.target.value)}
          placeholder={t("optional")}
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
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
