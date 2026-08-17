import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listAttributes } from "./actions";
import AttributesView from "./attributes-view";

export const metadata = {
  title: "Attributes",
};

export default async function AttributesPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("items")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, attributes] = await Promise.all([getServerT(), listAttributes(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("attributes")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("attributesSubtitle")}</p>
      </div>
      <AttributesView companySlug={company} initialAttributes={attributes} />
    </div>
  );
}
