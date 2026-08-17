"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createItemAction } from "@/app/[company]/(erp)/items/actions";

/**
 * Minimal item creation for CreatableSelect's onCreateNew — name, unit, and
 * both prices, enough to sell/buy it right away mid-document. Category,
 * barcode, secondary unit, and per-group pricing stay editable later from
 * the full Items page.
 */
export function ItemQuickAddForm({ companySlug, units, onDone, onCancel }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [primaryUnitId, setPrimaryUnitId] = useState(units[0] ? String(units[0].id) : "");
  const [purchasePrice, setPurchasePrice] = useState("0");
  const [sellingPrice, setSellingPrice] = useState("0");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const unitOptions = units.map((unit) => ({ value: String(unit.id), label: `${unit.name} (${unit.code})` }));

  async function submit() {
    setPending(true);
    setError(null);
    const result = await createItemAction(companySlug, { name, primaryUnitId, purchasePrice, sellingPrice });
    setPending(false);
    if (!result.ok) {
      setError(result.fieldErrors?.name?.[0] ? t(result.fieldErrors.name[0]) : t(result.formError ?? "somethingWentWrong"));
      return;
    }
    onDone({ value: result.id, label: name });
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="qa-item-name">{t("itemName")}</Label>
        <Input id="qa-item-name" className="h-11" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="qa-item-unit">{t("unit")}</Label>
        <CreatableSelect id="qa-item-unit" options={unitOptions} value={primaryUnitId} onChange={setPrimaryUnitId} placeholder={t("selectWarehouse")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="qa-item-purchase-price">{t("purchasePrice")}</Label>
          <Input id="qa-item-purchase-price" type="number" min="0" step="0.01" className="h-11" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qa-item-selling-price">{t("sellingPrice")}</Label>
          <Input id="qa-item-selling-price" type="number" min="0" step="0.01" className="h-11" value={sellingPrice} onChange={(event) => setSellingPrice(event.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="button" onClick={submit} disabled={pending || !name.trim() || !primaryUnitId}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
