"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { companies } from "@/db/schema/master";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getMasterDb } from "@/lib/db";
import { MODULE_KEYS, parseModuleList } from "@/lib/modules";

export async function getPurchasedModules(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  const masterDb = getMasterDb();
  const [company] = await masterDb
    .select({ purchasedModules: companies.purchasedModules })
    .from(companies)
    .where(eq(companies.id, context.session.companyId))
    .limit(1);
  return parseModuleList(company?.purchasedModules);
}

/**
 * Toggling what the account has purchased is billing-shaped, not ordinary
 * admin work — restricted to the owner, unlike most organization-level
 * actions which allow owner+admin.
 */
export async function updatePurchasedModulesAction(companySlug, moduleKey, enabled) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (context.session.role !== "owner") {
    return { ok: false, formError: "moduleStoreOwnerOnly" };
  }
  if (!MODULE_KEYS.includes(moduleKey)) {
    return { ok: false, formError: "moduleStoreOwnerOnly" };
  }

  const masterDb = getMasterDb();
  const [company] = await masterDb
    .select({ purchasedModules: companies.purchasedModules })
    .from(companies)
    .where(eq(companies.id, context.session.companyId))
    .limit(1);

  const current = new Set(parseModuleList(company?.purchasedModules));
  if (enabled) {
    current.add(moduleKey);
  } else {
    current.delete(moduleKey);
  }

  await masterDb
    .update(companies)
    .set({ purchasedModules: JSON.stringify([...current]) })
    .where(eq(companies.id, context.session.companyId));

  revalidatePath(`/${companySlug}/account/modules`);
  return { ok: true, purchasedModules: [...current] };
}
