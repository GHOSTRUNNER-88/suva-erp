"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { createPartyAction } from "@/app/[company]/(erp)/parties/actions";

/**
 * Minimal party creation for CreatableSelect's onCreateNew — just enough to
 * pick a party mid-document (name, type, phone) without leaving the
 * transaction form. Everything else (address, PAN, credit terms, opening
 * balance) stays editable later from the full Parties page.
 */
export function PartyQuickAddForm({ companySlug, defaultType = "Customer", onDone, onCancel }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState(defaultType);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await createPartyAction(companySlug, { name, type, phoneNumber });
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
        <Label htmlFor="qa-party-name">{t("partyName")}</Label>
        <Input id="qa-party-name" className="h-11" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("partyType")}</Label>
        <SegmentedControl
          options={[
            { value: "Customer", label: t("customer") },
            { value: "Supplier", label: t("supplier") },
            { value: "Both", label: t("Both") },
          ]}
          value={type}
          onChange={setType}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="qa-party-phone">{t("phone")}</Label>
        <Input id="qa-party-phone" className="h-11" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder={t("optional")} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="button" onClick={submit} disabled={pending || !name.trim()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
