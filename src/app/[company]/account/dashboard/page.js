import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  CircleAlert,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn, pickLocalized } from "@/lib/utils";
import { getServerLanguage, getServerT } from "@/lib/i18n-server";
import { translateIndustry } from "@/lib/organization/options";
import { getOrganizationManagementSummary } from "../organizations/actions";

export const metadata = {
  title: "Account Dashboard",
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

export default async function AccountDashboardPage({ params }) {
  const { company } = await params;
  const [t, language, { context, organizations }] = await Promise.all([
    getServerT(),
    getServerLanguage(),
    getOrganizationManagementSummary(company),
  ]);
  const formatDate = (value) => (value ? new Intl.DateTimeFormat("en-CA").format(new Date(value)) : t("notSet"));
  const totals = organizations.reduce(
    (summary, organization) => {
      summary.activeUsers += organization.userSummary.active;
      summary.pendingInvites += organization.userSummary.invited;
      summary.vatOrganizations += organization.isVatRegistered ? 1 : 0;
      return summary;
    },
    { activeUsers: 0, pendingInvites: 0, vatOrganizations: 0 }
  );
  const defaultOrganization =
    organizations.find((organization) => organization.isDefault) ?? organizations[0] ?? null;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="flex flex-col gap-4 border-b bg-[linear-gradient(135deg,rgba(247,181,0,0.12),rgba(34,197,94,0.06),transparent)] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{t("accountControlCenter")}</h1>
              <span className="rounded-lg border bg-background/70 px-2 py-1 text-xs font-medium text-muted-foreground">
                {t("ownerConsole")}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("accountControlCenterSubtitle")}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/${company}/account/organizations`}
              className={buttonVariants({ variant: "outline", className: "h-9" })}
            >
              <Building2 className="h-4 w-4" />
              {t("organizations")}
            </Link>
            <Link
              href={`/${company}/account/organizations/new`}
              className={buttonVariants({ className: "h-9" })}
            >
              <Plus className="h-4 w-4" />
              {t("addOrganization")}
            </Link>
          </div>
        </div>

        <div className="grid gap-px bg-border md:grid-cols-4">
          {[
            [t("organizations"), organizations.length, t("businessUnits"), Building2],
            [t("activeUsers"), totals.activeUsers, t("assignedAccess"), Users],
            [t("pendingInvites"), totals.pendingInvites, t("awaitingAcceptance"), CircleAlert],
            [t("vatOrganizations"), totals.vatOrganizations, t("vatEnabled"), CheckCircle2],
          ].map(([label, value, helper, Icon]) => (
            <div key={label} className="bg-background px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 text-3xl font-semibold">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-semibold">{t("organizations")}</h2>
              <p className="text-sm text-muted-foreground">{t("organizationsManagedInside")}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">{t("organization")}</th>
                  <th className="px-4 py-3 font-medium">{t("panNumber")}</th>
                  <th className="px-4 py-3 font-medium">{t("vat")}</th>
                  <th className="px-4 py-3 font-medium">{t("users")}</th>
                  <th className="px-4 py-3 font-medium">{t("features")}</th>
                  <th className="px-4 py-3 font-medium">{t("accountingStart")}</th>
                  <th className="px-5 py-3 text-right font-medium">{t("actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {organizations.map((organization) => {
                  const features = parseFeatures(organization.enabledFeatures);
                  return (
                    <tr key={organization.id} className="hover:bg-primary/5">
                      <td className="px-5 py-4">
                        <Link
                          href={`/${company}/account/organizations/${organization.id}/settings`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {pickLocalized(language, organization.name, organization.nameNe)}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {translateIndustry(t, organization.industry) || t("industryNotSet")} - {pickLocalized(language, organization.address, organization.addressNe) || t("addressNotSet")}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">{organization.panNumber || t("notSet")}</td>
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            "rounded-md px-2 py-1 text-xs font-medium",
                            organization.isVatRegistered
                              ? "bg-green-600/10 text-green-700"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {organization.isVatRegistered ? t("registered") : t("no")}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-medium">{organization.userSummary.active}</span>
                        <span className="text-muted-foreground"> {t("active").toLowerCase()}</span>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {features.length ? t("featuresEnabledCount", { count: features.length }) : t("basicAccounting")}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        <div>{t("ad")} {formatDate(organization.accountingStartDate)}</div>
                        <div className="text-xs">{t("bsPending")}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/${company}/account/organizations/${organization.id}/users`}
                            className={buttonVariants({ variant: "outline", size: "sm" })}
                          >
                            <Users className="h-3.5 w-3.5" />
                            {t("users")}
                          </Link>
                          <Link
                            href={`/${company}/account/organizations/${organization.id}/settings`}
                            className={buttonVariants({ size: "sm" })}
                          >
                            <Settings className="h-3.5 w-3.5" />
                            {t("settings")}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border bg-background p-5 shadow-sm">
            <h2 className="font-semibold">{t("accountIdentity")}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("workspaceUrl")}</dt>
                <dd className="font-medium">/{company}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("owner")}</dt>
                <dd className="text-right font-medium">
                  {context.user.firstName} {context.user.lastName}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("defaultOrganization")}</dt>
                <dd className="text-right font-medium">
                  {defaultOrganization ? pickLocalized(language, defaultOrganization.name, defaultOrganization.nameNe) : t("notSet")}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border bg-background p-5 shadow-sm">
            <h2 className="font-semibold">{t("setupHealth")}</h2>
            <div className="mt-4 space-y-3">
              {[
                [organizations.length > 0, t("healthOrgExists")],
                [totals.activeUsers > 0, t("healthOwnerAccess")],
                [organizations.every((organization) => organization.panNumber), t("healthPanCaptured")],
              ].map(([done, label]) => {
                const Icon = done ? CheckCircle2 : CircleAlert;
                return (
                  <div key={label} className="flex items-center gap-3 text-sm">
                    <Icon className={cn("h-4 w-4", done ? "text-green-700" : "text-amber-700")} />
                    <span className={done ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border bg-background p-5 shadow-sm">
            <h2 className="font-semibold">{t("managementAreas")}</h2>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <div className="flex gap-3">
                <Users className="mt-0.5 h-4 w-4 text-primary" />
                <span>{t("managementAreaUsers")}</span>
              </div>
              <div className="flex gap-3">
                <Settings className="mt-0.5 h-4 w-4 text-primary" />
                <span>{t("managementAreaSettings")}</span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
