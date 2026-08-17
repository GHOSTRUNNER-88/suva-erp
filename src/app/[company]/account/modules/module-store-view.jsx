"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_MODULE_KEYS, MODULE_CATALOG } from "@/lib/modules";
import { updatePurchasedModulesAction } from "./actions";

// Default modules (see lib/modules.js) are bundled with every account
// automatically and can't be purchased or removed — they're not shown here
// at all, only the optional add-ons (Payroll, Maskebari, ...) are.
const PURCHASABLE_MODULES = MODULE_CATALOG.filter((module) => !module.default);

export function ModuleStoreView({ companySlug, initialPurchasedModules, canManage }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [purchased, setPurchased] = useState(new Set(initialPurchasedModules));
  const [pendingKey, setPendingKey] = useState(null);
  const [error, setError] = useState(null);

  async function toggle(moduleKey) {
    if (!canManage || pendingKey) return;
    const enabling = !purchased.has(moduleKey);
    setPendingKey(moduleKey);
    setError(null);

    const result = await updatePurchasedModulesAction(companySlug, moduleKey, enabling);
    setPendingKey(null);
    if (!result.ok) {
      setError(result.formError ? t(result.formError) : null);
      return;
    }
    setPurchased(new Set(result.purchasedModules));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/30 p-3">
        <p className="text-xs font-medium text-muted-foreground">{t("defaultModulesIncluded")}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DEFAULT_MODULE_KEYS.map((key) => {
            const catalogEntry = MODULE_CATALOG.find((item) => item.key === key);
            return (
              <span key={key} className="rounded-md bg-background px-2 py-1 text-xs font-medium">
                {t(catalogEntry.labelKey)}
              </span>
            );
          })}
        </div>
      </div>

      {!canManage && (
        <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {t("moduleStoreOwnerOnly")}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PURCHASABLE_MODULES.map((module) => {
          const Icon = module.icon;
          const isPurchased = purchased.has(module.key);
          const isPending = pendingKey === module.key;
          return (
            <div
              key={module.key}
              className={cn(
                "rounded-xl border bg-background p-4 transition-colors",
                isPurchased && "border-primary/40 bg-primary/5"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-medium">{t(module.labelKey)}</p>
                    <span
                      className={cn(
                        "mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                        module.built
                          ? "bg-green-600/10 text-green-700 dark:text-green-500"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {module.built ? t("moduleBuilt") : t("moduleComingSoon")}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isPurchased}
                  onClick={() => toggle(module.key)}
                  disabled={!canManage || isPending}
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
                    isPurchased ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow-sm transition-transform",
                      isPurchased && "translate-x-5"
                    )}
                  >
                    {isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    {!isPending && isPurchased && <Check className="h-3 w-3 text-primary" />}
                  </span>
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {isPurchased ? t("modulePurchased") : t("moduleNotPurchased")}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
