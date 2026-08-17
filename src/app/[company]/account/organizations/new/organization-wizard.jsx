"use client";

import { useRef, useState, useTransition } from "react";
import { Building2, Check, ChevronLeft, CircleDollarSign, Factory, Loader2, MapPin, Package, Store, Upload, Utensils, Warehouse } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createOrganizationAction, uploadOrganizationLogoAction } from "../actions";
import { notify } from "@/lib/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DualDateField } from "@/components/dual-date-field";
import { Combobox } from "@/components/ui/combobox";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StepProgress } from "@/components/ui/step-progress";
import { FEATURE_LABEL_KEYS, INDUSTRY_OPTIONS, translateIndustry } from "@/lib/organization/options";

const FEATURE_ICONS = {
  trackInventory: Package,
  multipleLocations: MapPin,
  manufacturing: Factory,
  multipleWarehouses: Warehouse,
  posRetail: Store,
  multiCurrency: CircleDollarSign,
  posRestaurant: Utensils,
};

// Single source of truth for the feature key set is FEATURE_LABEL_KEYS
// (shared with every other place enabledFeatures gets displayed) — this
// just pairs each key with its icon for the wizard's card grid.
const FEATURES = Object.entries(FEATURE_LABEL_KEYS).map(([key, labelKey]) => [
  key,
  labelKey,
  `${labelKey}Desc`,
  FEATURE_ICONS[key],
]);

// Smart defaults: a new organization is far more likely to be a Retail
// business than anything else, and VAT-registered — so the wizard opens
// with real answers already selected instead of blank/unselected fields.
const initialForm = {
  name: "",
  industry: "Retail",
  address: "",
  accountingStartDate: "",
  isVatRegistered: true,
  email: "",
  phoneNumber: "",
  panNumber: "",
  website: "",
  logoUrl: "",
  features: FEATURES.map(([key]) => key),
};

export default function OrganizationWizard({
  companySlug,
  defaultPanNumber,
  submitAction = createOrganizationAction,
  initialValues,
  heading,
  subheading,
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ ...initialForm, panNumber: defaultPanNumber ?? "", ...initialValues });
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isPending, startTransition] = useTransition();

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleFeature(feature) {
    setForm((current) => ({
      ...current,
      features: current.features.includes(feature)
        ? current.features.filter((item) => item !== feature)
        : [...current.features, feature],
    }));
  }

  function next() {
    setError(null);
    setFieldErrors({});
    setStep((value) => Math.min(value + 1, 3));
  }

  function back() {
    setError(null);
    setFieldErrors({});
    setStep((value) => Math.max(value - 1, 1));
  }

  function submit() {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await submitAction(companySlug, form);
      if (result && !result.ok) {
        setError(result.formError ? t(result.formError) : null);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  const WIZARD_STEPS = [
    { key: "details", label: t("wizardStepDetails") },
    { key: "features", label: t("wizardStepFeatures") },
    { key: "review", label: t("wizardStepReview") },
  ];

  return (
    <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border bg-background shadow-sm">
      <div className="border-b bg-muted/20 px-5 py-4">
        <StepProgress steps={WIZARD_STEPS} currentStep={step} />
      </div>

      <div className="p-5 md:p-7">
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {step === 1
              ? (heading ?? t("organizationDetails"))
              : step === 2
                ? t("accountingFeaturesTitle")
                : t("reviewYourOrganization")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === 1
              ? (subheading ?? t("organizationDetailsSubtitle"))
              : step === 2
                ? t("accountingFeaturesSubtitle")
                : t("reviewSubtitle")}
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === 1 && (
        <div className="grid gap-4 md:grid-cols-2">
          <LogoUploadField
            companySlug={companySlug}
            value={form.logoUrl}
            onChange={(url) => update("logoUrl", url)}
            className="md:col-span-2"
          />
          <Field label={t("organizationName")} name="name" value={form.name} update={update} error={fieldErrors.name?.[0]} />
          <IndustryField value={form.industry} update={update} error={fieldErrors.industry?.[0]} />
          <Field label={t("organizationAddress")} name="address" value={form.address} update={update} error={fieldErrors.address?.[0]} className="md:col-span-2" />
          <DualDateField
            id="accountingStartDate"
            label={t("accountingStartDate")}
            value={form.accountingStartDate}
            onChange={(value) => update("accountingStartDate", value)}
          />
          {fieldErrors.accountingStartDate?.[0] && (
            <p className="-mt-3 text-xs text-destructive">{t(fieldErrors.accountingStartDate[0])}</p>
          )}
          <div className="space-y-1.5">
            <Label>{t("registeredWithVat")}</Label>
            <SegmentedControl
              options={[
                { value: true, label: t("yes") },
                { value: false, label: t("no") },
              ]}
              value={form.isVatRegistered}
              onChange={(value) => update("isVatRegistered", value)}
            />
          </div>
          <Field label={t("email")} name="email" type="email" value={form.email} update={update} error={fieldErrors.email?.[0]} optional />
          <Field label={t("organizationPhoneNumber")} name="phoneNumber" value={form.phoneNumber} update={update} error={fieldErrors.phoneNumber?.[0]} optional />
          <Field label={t("panNumber")} name="panNumber" value={form.panNumber} update={update} error={fieldErrors.panNumber?.[0]} optional />
          <Field label={t("website")} name="website" value={form.website} update={update} error={fieldErrors.website?.[0]} optional />
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-3 md:grid-cols-2">
          {FEATURES.map(([key, titleKey, descriptionKey, Icon]) => {
            const selected = form.features.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleFeature(key)}
                className={`grid min-h-24 grid-cols-[44px_1fr_24px] items-center gap-4 rounded-xl border p-4 text-left transition-colors ${
                  selected ? "border-primary bg-primary/8 shadow-[inset_3px_0_0_var(--primary)]" : "bg-background hover:bg-muted/40"
                }`}
              >
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold text-primary">{t(titleKey)}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{t(descriptionKey)}</span>
                </span>
                <span className={`grid h-5 w-5 place-items-center rounded-md ${selected ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {selected && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-8">
          <div>
            <h2 className="mb-4 font-semibold">{t("organizationDetails")}</h2>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              {[
                [t("name"), form.name],
                [t("industry"), translateIndustry(t, form.industry)],
                [t("accountingStartDate"), form.accountingStartDate],
                [t("vatRegistered"), form.isVatRegistered ? t("yes") : t("no")],
                [t("panNumber"), form.panNumber || "-"],
                [t("website"), form.website || "-"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-6 border-b pb-2">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h2 className="mb-4 font-semibold">{t("selectedFeatures")}</h2>
            <div className="flex flex-wrap gap-2">
              {FEATURES.filter(([key]) => form.features.includes(key)).map(([key, titleKey]) => (
                <span key={key} className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1 text-sm text-sky-700">
                  {t(titleKey)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-between border-t pt-5">
        <Button type="button" variant="outline" className="h-11 px-6" onClick={back} disabled={step === 1 || isPending}>
          <ChevronLeft className="h-4 w-4" />
          {t("back")}
        </Button>
        {step < 3 ? (
          <Button type="button" className="h-11 px-6" onClick={next}>
            {t("saveAndContinue")}
          </Button>
        ) : (
          <Button type="button" className="h-11 px-6" onClick={submit} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {t("confirmAndSubmit")}
          </Button>
        )}
      </div>
      </div>
    </div>
  );
}

function LogoUploadField({ companySlug, value, onChange, className = "" }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("logo", file);
    const result = await uploadOrganizationLogoAction(companySlug, formData);
    setUploading(false);

    if (!result.ok) {
      notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
      return;
    }
    onChange(result.url);
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label>{t("organizationLogo")}</Label>
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-muted">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- Firebase Storage URL, not a local/optimizable asset
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <Building2 className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          <Button type="button" variant="outline" className="h-9" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? t("uploading") : value ? t("changeLogo") : t("uploadLogo")}
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">{t("logoHint")}</p>
        </div>
      </div>
    </div>
  );
}

function IndustryField({ value, update, error }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Label htmlFor="industry">{t("industry")}</Label>
      <Combobox
        id="industry"
        options={INDUSTRY_OPTIONS}
        value={value}
        onChange={(next) => update("industry", next)}
        placeholder={t("selectIndustry")}
      />
      {error && <p className="text-xs text-destructive">{t(error)}</p>}
    </div>
  );
}

function Field({ label, name, value, update, error, type = "text", optional = false, className = "" }) {
  const { t } = useTranslation();
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={name}>{label}{optional ? ` (${t("optional").toLowerCase()})` : ""}</Label>
      <Input id={name} type={type} value={value} onChange={(event) => update(name, event.target.value)} className="h-11" />
      {error && <p className="text-xs text-destructive">{t(error)}</p>}
    </div>
  );
}
