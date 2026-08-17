import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getServerT } from "@/lib/i18n-server";
import { getOrganizationManagementSummary } from "./actions";
import { OrganizationsSplitView } from "./organizations-split-view";

export const metadata = {
  title: "Organizations",
};

export default async function OrganizationsPage({ params }) {
  const { company } = await params;
  const [t, { organizations }] = await Promise.all([
    getServerT(),
    getOrganizationManagementSummary(company),
  ]);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="flex flex-col gap-4 border-b bg-[linear-gradient(135deg,rgba(247,181,0,0.12),rgba(14,165,233,0.06),transparent)] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">{t("organizations")}</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("organizationsBreadcrumb")}
            </p>
          </div>
          <Link href={`/${company}/account/organizations/new`} className={buttonVariants({ className: "h-9" })}>
            <Plus className="h-4 w-4" />
            {t("addOrganization")}
          </Link>
        </div>

        <div className="grid gap-px bg-border md:grid-cols-4">
          {[
            [t("all"), organizations.length],
            [t("vatRegistered"), organizations.filter((organization) => organization.isVatRegistered).length],
            [t("withPan"), organizations.filter((organization) => organization.panNumber).length],
            [t("activeUsers"), organizations.reduce((total, organization) => total + organization.userSummary.active, 0)],
          ].map(([label, value]) => (
            <div key={label} className="bg-background px-5 py-3">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <OrganizationsSplitView companySlug={company} organizations={organizations} />
    </div>
  );
}
