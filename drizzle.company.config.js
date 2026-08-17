import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

loadEnv({ path: ".env.local" });

/**
 * Migrations for the Company schema template — this gets applied to a
 * NEW physical database every time a Company signs up (see
 * src/lib/db/provision.js), not to one fixed database. `dbCredentials`
 * here is only to satisfy drizzle-kit's config validation for `generate`;
 * it is never pushed against directly.
 */
export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema/company.js",
  out: "./drizzle/company",
  dbCredentials: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_MASTER_NAME,
  },
});
