"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Check, Loader2, PackageCheck, Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { notify } from "@/lib/toast";
import { updateNegativeStockActionAction } from "../../actions";

function negativeStockLabel(t, value) {
  if (value === 0) return t("negativeStockActionAllow");
  if (value === 2) return t("negativeStockActionBlock");
  return t("negativeStockActionWarn");
}

/**
 * Inventory card of the Organization Settings page. trackInventory /
 * multipleWarehouses / multipleLocations stay plain read-only rows — they
 * come from enabledFeatures, managed via the Organization Modules/Features
 * flow, not here. negativeStockAction is the one field this card actually
 * lets an owner/admin edit in place: it's a real Settings-table value
 * (db/schema/organization.js) that items/inventory/actions.js's
 * adjustInventoryAction/transferStockAction branch on (0 = allow silently,
 * 1 = allow with a warning, 2 = block with a hard error) — not a display
 * placeholder, so it needs a real save path, unlike the rest of this page.
 */
export function InventorySettingsCard({
  companySlug,
  organizationId,
  trackInventory,
  multipleWarehouses,
  multipleLocations,
  negativeStockAction,
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [value, setValue] = useState(negativeStockAction);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(negativeStockAction);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function startEditing() {
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  function save() {
    setSaving(true);
    setError(null);
    startSave();
  }

  async function startSave() {
    const result = await updateNegativeStockActionAction(companySlug, organizationId, draft);
    setSaving(false);
    if (!result.ok) {
      setError(result.formError ? t(result.formError) : t("somethingWentWrong"));
      return;
    }
    setValue(result.negativeStockAction);
    setEditing(false);
    notify.success(t("orgUpdated"));
    router.refresh();
  }

  const readOnlyRows = [
    [t("trackInventory"), trackInventory ? t("enabled") : t("disabled")],
    [t("multipleWarehouses"), multipleWarehouses ? t("enabled") : t("disabled")],
    [t("multipleLocations"), multipleLocations ? t("enabled") : t("disabled")],
  ];

  return (
    <section className="rounded-lg border bg-background p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">{t("inventory")}</h2>
        </div>
        {!editing && (
          <Button type="button" variant="outline" size="sm" onClick={startEditing}>
            <Pencil className="h-3.5 w-3.5" />
            {t("editSettings")}
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <dl className="mt-4 space-y-3 text-sm">
        {readOnlyRows.map(([label, rowValue]) => (
          <div key={label} className="flex justify-between gap-4 border-b pb-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{rowValue}</dd>
          </div>
        ))}

        {!editing && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("negativeStockAction")}</dt>
            <dd className="text-right font-medium">{negativeStockLabel(t, value)}</dd>
          </div>
        )}
      </dl>

      {editing && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("negativeStockAction")}</p>
          <SegmentedControl
            wrap
            options={[
              { value: 0, label: t("negativeStockActionAllow") },
              { value: 1, label: t("negativeStockActionWarn") },
              { value: 2, label: t("negativeStockActionBlock") },
            ]}
            value={draft}
            onChange={setDraft}
          />
          <p className="text-xs text-muted-foreground">{t("negativeStockActionHint")}</p>
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? t("saving") : t("saveChanges")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
