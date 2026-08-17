import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, UserRound } from "lucide-react";
import { getServerT } from "@/lib/i18n-server";
import { getOrganizationDetail, listOrganizationUsers } from "../../../actions";

export const metadata = {
  title: "Organization User",
};

function fullName(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

export default async function OrganizationUserDetailPage({ params }) {
  const { company, organization, user } = await params;
  const [t, organizationRow, userRows] = await Promise.all([
    getServerT(),
    getOrganizationDetail(company, organization),
    listOrganizationUsers(company, organization),
  ]);

  const userRow = userRows.find((row) => row.id === Number(user));

  if (!organizationRow || !userRow) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <Link
        href={`/${company}/account/organizations/${organization}/users`}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("users")}
      </Link>

      <section className="rounded-lg border bg-background">
        <div className="flex items-start gap-4 border-b px-5 py-4">
          <div className="rounded-lg bg-primary/10 p-3 text-primary">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{fullName(userRow)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("userAccessFor", { name: organizationRow.name })}</p>
          </div>
        </div>
        <div className="grid gap-px bg-border md:grid-cols-2">
          {[
            [t("email"), userRow.email],
            [t("phone"), userRow.phoneNumber || t("notSet")],
            [t("companyRole"), t(userRow.companyRole)],
            [t("organizationRole"), t(userRow.organizationRole)],
            [t("status"), t(userRow.organizationStatus)],
            [t("accessScope"), organizationRow.name],
          ].map(([label, value]) => (
            <div key={label} className="bg-background p-5">
              <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
              <p className="mt-1 font-medium">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-background p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
          <p className="text-sm text-muted-foreground">
            {t("userManagedNotice")}
          </p>
        </div>
      </section>
    </div>
  );
}
