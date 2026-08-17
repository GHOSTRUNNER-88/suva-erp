import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

loadEnv({ path: ".env.local" });

/**
 * Migrations for the Organization schema template — applied to a NEW
 * physical database every time a Company creates an Organization (see
 * src/lib/db/provision.js), not to one fixed database. `dbCredentials`
 * here only satisfies drizzle-kit's config validation for `generate`.
 */
export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema/organization.js",
  out: "./drizzle/organization",
  dbCredentials: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_MASTER_NAME,
  },
});
