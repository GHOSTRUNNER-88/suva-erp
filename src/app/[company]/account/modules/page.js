import { Store } from "lucide-react";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getPurchasedModules } from "./actions";
import { ModuleStoreView } from "./module-store-view";

export const metadata = {
  title: "Module Store",
};

export default async function ModuleStorePage({ params }) {
  const { company } = await params;
  const [t, context, purchasedModules] = await Promise.all([
    getServerT(),
    getAuthenticatedAppContext(company),
    getPurchasedModules(company),
  ]);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="flex items-center gap-3 border-b bg-[linear-gradient(135deg,rgba(247,181,0,0.12),rgba(14,165,233,0.06),transparent)] px-5 py-5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/12 text-primary">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("moduleStore")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("moduleStoreSubtitle")}</p>
          </div>
        </div>
      </section>

      <ModuleStoreView
        companySlug={company}
        initialPurchasedModules={purchasedModules}
        canManage={context.session.role === "owner"}
      />
    </div>
  );
}
