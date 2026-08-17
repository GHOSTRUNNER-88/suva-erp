import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getServerLanguage, getServerT } from "@/lib/i18n-server";
import { pickLocalized } from "@/lib/utils";
import { getOrganizationDetail } from "../../../actions";

export const metadata = {
  title: "Add Organization User",
};

export default async function NewOrganizationUserPage({ params }) {
  const { company, organization } = await params;
  const [t, organizationRow] = await Promise.all([getServerT(), getOrganizationDetail(company, organization)]);

  if (!organizationRow) {
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
        <div className="border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight">{t("addUser")}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("addUserHint", { name: organizationRow.name })}
          </p>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_320px]">
          <form className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">{t("firstName")}</Label>
                <Input id="firstName" name="firstName" placeholder={t("firstName")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{t("lastName")}</Label>
                <Input id="lastName" name="lastName" placeholder={t("lastName")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input id="email" name="email" type="email" placeholder="name@company.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">{t("phone")}</Label>
                <Input id="phoneNumber" name="phoneNumber" placeholder={t("phone")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">{t("organizationRole")}</Label>
                <Input id="role" name="role" value="member" readOnly />
              </div>
              <div className="space-y-2">
                <Label htmlFor="access">{t("accessScope")}</Label>
                <Input id="access" name="access" value={organizationRow.name} readOnly />
              </div>
            </div>

            <div className="rounded-lg border bg-amber-600/10 p-4 text-sm text-amber-800">
              {t("inviteBackendPendingNotice")}
            </div>

            <div className="flex justify-end gap-2">
              <Link
                href={`/${company}/account/organizations/${organization}/users`}
                className={buttonVariants({ variant: "outline" })}
              >
                {t("back")}
              </Link>
              <button className={buttonVariants()} type="button" disabled>
                {t("sendInvite")}
              </button>
            </div>
          </form>

          <aside className="space-y-4">
            {[
              [Mail, t("emailDomainCheck"), t("emailDomainCheckHint")],
              [ShieldCheck, t("orgAccessTitle"), t("orgAccessHint")],
              [CheckCircle2, t("reviewBeforeErp"), t("reviewBeforeErpHint")],
            ].map(([Icon, title, detail]) => (
              <div key={title} className="rounded-lg border bg-background p-4">
                <Icon className="h-4 w-4 text-primary" />
                <p className="mt-3 text-sm font-medium">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
              </div>
            ))}
          </aside>
        </div>
      </section>
    </div>
  );
}
