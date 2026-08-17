import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

/**
 * One-time/repeatable: applies drizzle/master's migrations to the fixed
 * master database (creating it first if it doesn't exist yet). Run after
 * `npx drizzle-kit generate --config drizzle.master.config.js` whenever
 * the master schema changes.
 *
 *   node scripts/migrate-master.js
 */
async function main() {
  const adminConn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? "",
  });

  const dbName = process.env.DB_MASTER_NAME;
  await adminConn.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await adminConn.end();

  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? "",
    database: dbName,
  });

  const db = drizzle(pool, { mode: "default" });
  await migrate(db, { migrationsFolder: "./drizzle/master" });
  await pool.end();

  console.log(`Master database "${dbName}" is up to date.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
