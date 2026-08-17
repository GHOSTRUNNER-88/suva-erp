import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Plus, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn, pickLocalized } from "@/lib/utils";
import { getServerLanguage, getServerT } from "@/lib/i18n-server";
import {
  getOrganizationDetail,
  listOrganizationUsers,
} from "../../actions";
import { OrganizationTabs } from "../organization-tabs";

export const metadata = {
  title: "Organization Users",
};

function fullName(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

export default async function OrganizationUsersPage({ params }) {
  const { company, organization } = await params;
  const [t, language, organizationRow, userRows] = await Promise.all([
    getServerT(),
    getServerLanguage(),
    getOrganizationDetail(company, organization),
    listOrganizationUsers(company, organization),
  ]);

  if (!organizationRow) {
    notFound();
  }

  const localizedName = pickLocalized(language, organizationRow.name, organizationRow.nameNe);

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
        <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t("users")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("accountDashboard")} / {t("organizations")} / {localizedName} / {t("users")}
            </p>
          </div>
          <Link
            href={`/${company}/account/organizations/${organization}/users/new`}
            className={buttonVariants({ className: "h-9" })}
          >
            <Plus className="h-4 w-4" />
            {t("addUser")}
          </Link>
        </div>
        <OrganizationTabs companySlug={company} organizationId={organization} active="users" />
      </section>

      <section className="overflow-hidden rounded-lg border bg-background">
        <div className="flex flex-col gap-3 border-b px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold">{t("organizationUsers")}</h2>
            <p className="text-sm text-muted-foreground">{t("organizationUsersHint")}</p>
          </div>
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {t("totalUsersCount", { count: userRows.length })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">{t("name")}</th>
                <th className="px-4 py-3 font-medium">{t("email")}</th>
                <th className="px-4 py-3 font-medium">{t("phone")}</th>
                <th className="px-4 py-3 font-medium">{t("role")}</th>
                <th className="px-4 py-3 font-medium">{t("status")}</th>
                <th className="px-4 py-3 font-medium">{t("access")}</th>
                <th className="px-5 py-3 text-right font-medium">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {userRows.map((user) => (
                <tr key={user.id} className="hover:bg-muted/30">
                  <td className="px-5 py-4">
                    <div className="font-medium">{fullName(user)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{t(user.companyRole)} {t("account").toLowerCase()}</div>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-4 text-muted-foreground">{user.phoneNumber || t("notSet")}</td>
                  <td className="px-4 py-4">
                    <span className="rounded-md border bg-muted/40 px-2 py-1 text-xs font-medium">
                      {t(user.organizationRole)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-medium",
                        user.organizationStatus === "active"
                          ? "bg-green-600/10 text-green-700"
                          : "bg-amber-600/10 text-amber-700"
                      )}
                    >
                      {t(user.organizationStatus)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      {t("organizationOnly")}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`mailto:${user.email}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {t("email")}
                      </Link>
                      <Link
                        href={`/${company}/account/organizations/${organization}/users/${user.id}`}
                        className={buttonVariants({ size: "sm" })}
                      >
                        {t("view")}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
