import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

loadEnv({ path: ".env.local" });

/**
 * Migrations for the ONE fixed master database (the Company directory).
 * Run directly: `npx drizzle-kit generate --config drizzle.master.config.js`
 * then apply with `node scripts/migrate-master.js`.
 */
export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema/master.js",
  out: "./drizzle/master",
  dbCredentials: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_MASTER_NAME,
  },
});
