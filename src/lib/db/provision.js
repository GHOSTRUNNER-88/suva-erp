import { migrate } from "drizzle-orm/mysql2/migrator";
import { drizzle } from "drizzle-orm/mysql2";
import { getAdminPool, getPool } from "./pools";

/**
 * Builds a safe, collision-resistant physical database name:
 * suva_{kind}_{slug}_{shortId}. MySQL database identifiers can't contain
 * most punctuation, so the slug is reduced to [a-z0-9_] first. The
 * trailing id suffix is the actual uniqueness guarantee (mirrors the
 * legacy app's build_company_db_name()) — the slug is just for
 * readability when browsing databases directly.
 */
export function buildDatabaseName(kind, slug, uniqueId) {
  const cleanSlug = String(slug)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);

  const name = `suva_${kind}_${cleanSlug || "x"}_${uniqueId}`;
  // MySQL identifier length limit is 64.
  return name.slice(0, 64);
}

async function createDatabase(databaseName) {
  const adminPool = getAdminPool();
  await adminPool.query(
    `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
}

async function applyMigrations(databaseName, migrationsFolder) {
  const pool = getPool(databaseName);
  const db = drizzle(pool, { mode: "default" });
  await migrate(db, { migrationsFolder });
}

/** Creates a new Company database and applies the Company schema to it. */
export async function provisionCompanyDatabase(databaseName) {
  await createDatabase(databaseName);
  await applyMigrations(databaseName, "./drizzle/company");
}

/** Creates a new Organization database and applies the Organization schema to it. */
export async function provisionOrganizationDatabase(databaseName) {
  await createDatabase(databaseName);
  await applyMigrations(databaseName, "./drizzle/organization");
}
