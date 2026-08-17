import { redirect } from "next/navigation";
import UnitsClient from "./units-client";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listAllUnits } from "./actions";

export const metadata = {
  title: "Units",
};

export default async function UnitsPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  // A member without "units" access shouldn't be able to reach this page
  // by URL even though it's hidden from their sidebar (see app-shell.jsx).
  if (!context.accessibleModules.includes("units")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, units] = await Promise.all([getServerT(), listAllUnits(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("unitsTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("unitsSubtitle")}</p>
      </div>
      <UnitsClient companySlug={company} initialUnits={units} />
    </div>
  );
}
