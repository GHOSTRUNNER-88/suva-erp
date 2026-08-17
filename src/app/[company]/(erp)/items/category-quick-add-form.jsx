"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { IconPicker } from "@/components/ui/icon-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createItemCategoryAction } from "./actions";

/**
 * Quick-add form for an Item Category, opened from CreatableSelect's
 * pinned "+ Add Category" row (see components/ui/creatable-select.jsx's
 * onCreateNew) inside the Item form.
 */
export function CategoryQuickAddForm({ companySlug, onCreated, onCancel }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: "", description: "", icon: "" });
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
    const result = await createItemCategoryAction(companySlug, form);
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
        <Label htmlFor="quick-category-name">{t("itemCategoryName")}</Label>
        <Input
          id="quick-category-name"
          className="h-11"
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
        />
        {fieldErrors.name?.[0] && <p className="text-xs text-destructive">{t(fieldErrors.name[0])}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="quick-category-icon">{t("icon")}</Label>
        <IconPicker id="quick-category-icon" value={form.icon} onChange={(value) => update("icon", value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="quick-category-description">{t("description")}</Label>
        <Input
          id="quick-category-description"
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
