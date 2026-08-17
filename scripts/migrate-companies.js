import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

function connectionConfig(database) {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? "",
    database,
  };
}

async function main() {
  const master = await mysql.createConnection(connectionConfig(process.env.DB_MASTER_NAME));
  const [companies] = await master.query("SELECT company_db_name FROM companies ORDER BY id ASC");
  await master.end();

  for (const company of companies) {
    const pool = mysql.createPool({
      ...connectionConfig(company.company_db_name),
      waitForConnections: true,
      connectionLimit: 3,
      queueLimit: 0,
    });
    await migrate(drizzle(pool, { mode: "default" }), {
      migrationsFolder: "./drizzle/company",
    });
    await pool.end();
    console.log(`Company database "${company.company_db_name}" is up to date.`);
  }

  console.log(`Migrated ${companies.length} company database(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
