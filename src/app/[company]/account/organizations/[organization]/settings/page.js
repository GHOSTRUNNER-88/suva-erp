import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Banknote, FileText, Globe2, ShieldCheck } from "lucide-react";
import { getServerLanguage, getServerT } from "@/lib/i18n-server";
import { translateIndustry } from "@/lib/organization/options";
import { pickLocalized } from "@/lib/utils";
import { getOrganizationDetail, getOrganizationSettings } from "../../actions";
import { OrganizationTabs } from "../organization-tabs";
import { InventorySettingsCard } from "./inventory-settings-card";

export const metadata = {
  title: "Organization Settings",
};

function parseFeatures(value) {
  if (!value) {
    return [];
  }
  try {
    const features = JSON.parse(value);
    return Array.isArray(features) ? features : [];
  } catch {
    return [];
  }
}

export default async function OrganizationSettingsPage({ params }) {
  const { company, organization } = await params;
  const [t, language, organizationRow, organizationSettings] = await Promise.all([
    getServerT(),
    getServerLanguage(),
    getOrganizationDetail(company, organization),
    getOrganizationSettings(company, organization),
  ]);
  const formatDate = (value) => (value ? new Intl.DateTimeFormat("en-CA").format(new Date(value)) : t("notSet"));

  if (!organizationRow) {
    notFound();
  }

  const localizedName = pickLocalized(language, organizationRow.name, organizationRow.nameNe);
  const features = parseFeatures(organizationRow.enabledFeatures);
  const hasFeature = (feature) => features.includes(feature);

  return (
    <div className="space-y-5">
      <Link
        href={`/${company}/account/organizations`}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {localizedName}
      </Link>

      <section className="overflow-hidden rounded-lg border bg-background">
        <div className="px-5 py-4">
          <h1 className="text-xl font-semibold tracking-tight">{t("organizationSettings")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("accountDashboard")} / {t("organizations")} / {localizedName} / {t("settings")}
          </p>
        </div>
        <OrganizationTabs companySlug={company} organizationId={organization} active="settings" />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {[
          {
            title: t("general"),
            icon: Globe2,
            rows: [
              [t("organizationName"), localizedName],
              [t("industry"), translateIndustry(t, organizationRow.industry) || t("notSet")],
              [t("panNumber"), organizationRow.panNumber || t("notSet")],
              [t("vatRegistered"), organizationRow.isVatRegistered ? t("yes") : t("no")],
            ],
          },
          {
            title: t("accounting"),
            icon: Banknote,
            rows: [
              [t("accountingStartDate"), `${t("ad")} ${formatDate(organizationRow.accountingStartDate)} / ${t("bsPending")}`],
              [t("defaultCurrency"), hasFeature("multiCurrency") ? t("nprMultiCurrency") : "NPR"],
              [t("multiCurrency"), hasFeature("multiCurrency") ? t("enabled") : t("disabled")],
            ],
          },
          {
            title: t("invoicing"),
            icon: FileText,
            rows: [
              [t("defaultInvoicePrefix"), "INV"],
              [t("purchaseBillPrefix"), "PB"],
              [t("creditNotePrefix"), "CN"],
              [t("debitNotePrefix"), "DN"],
            ],
          },
        ].map((section) => {
          const Icon = section.icon;
          return (
            <section key={section.title} className="rounded-lg border bg-background p-5">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">{section.title}</h2>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                {section.rows.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 border-b pb-3 last:border-b-0 last:pb-0">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}

        {/* The one card on this page with real editable data behind it —
            negativeStockAction is a live Settings-table value that
            items/inventory/actions.js's stock-adjustment/transfer actions
            branch on, not a display placeholder like the rest of this
            page's rows (see inventory-settings-card.jsx). */}
        <InventorySettingsCard
          companySlug={company}
          organizationId={organization}
          trackInventory={hasFeature("trackInventory")}
          multipleWarehouses={hasFeature("multipleWarehouses")}
          multipleLocations={hasFeature("multipleLocations")}
          negativeStockAction={organizationSettings?.negativeStockAction ?? 1}
        />

        <section className="rounded-lg border bg-background p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">{t("access")}</h2>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            {[
              [t("defaultInvitedRole"), t("member")],
              [t("allowedLogin"), `/${company}/login`],
              [t("accessScope"), t("organizationOnly")],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b pb-3 last:border-b-0 last:pb-0">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
