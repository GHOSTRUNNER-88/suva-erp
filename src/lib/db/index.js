import { drizzle } from "drizzle-orm/mysql2";
import { getPool, masterDatabaseName } from "./pools";
import * as masterSchema from "@/db/schema/master";
import * as companySchema from "@/db/schema/company";
import * as organizationSchema from "@/db/schema/organization";

const globalForDrizzle = globalThis;

function drizzleCache() {
  if (!globalForDrizzle.__suvaDrizzleCache) {
    globalForDrizzle.__suvaDrizzleCache = new Map();
  }
  return globalForDrizzle.__suvaDrizzleCache;
}

function cachedDrizzle(cacheKey, databaseName, schema) {
  const cache = drizzleCache();
  const existing = cache.get(cacheKey);
  if (existing) {
    return existing;
  }
  const instance = drizzle(getPool(databaseName), { schema, mode: "default" });
  cache.set(cacheKey, instance);
  return instance;
}

/** The single fixed database — the Company (tenant) directory only. */
export function getMasterDb() {
  const name = masterDatabaseName();
  return cachedDrizzle(`master:${name}`, name, masterSchema);
}

/** A specific Company's own database — users, roles, and its Organizations. */
export function getCompanyDb(companyDbName) {
  return cachedDrizzle(`company:${companyDbName}`, companyDbName, companySchema);
}

/** A specific Organization's own database — the actual ERP transactional data. */
export function getOrganizationDb(organizationDbName) {
  return cachedDrizzle(`org:${organizationDbName}`, organizationDbName, organizationSchema);
}
