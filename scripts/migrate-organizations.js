import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

function baseConnectionConfig(database) {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? "",
    database,
  };
}

async function main() {
  const masterDbName = process.env.DB_MASTER_NAME;
  const master = await mysql.createConnection(baseConnectionConfig(masterDbName));
  const [companies] = await master.query("SELECT id, slug, company_db_name FROM companies");
  await master.end();

  const organizationDbNames = [];

  for (const company of companies) {
    const companyConn = await mysql.createConnection(baseConnectionConfig(company.company_db_name));
    const [organizations] = await companyConn.query(
      "SELECT organization_db_name FROM organizations ORDER BY id ASC"
    );
    await companyConn.end();

    for (const organization of organizations) {
      organizationDbNames.push(organization.organization_db_name);
    }
  }

  for (const dbName of organizationDbNames) {
    const pool = mysql.createPool({
      ...baseConnectionConfig(dbName),
      waitForConnections: true,
      connectionLimit: 3,
      queueLimit: 0,
    });
    await migrate(drizzle(pool, { mode: "default" }), {
      migrationsFolder: "./drizzle/organization",
    });
    await pool.end();
    console.log(`Organization database "${dbName}" is up to date.`);
  }

  console.log(`Migrated ${organizationDbNames.length} organization database(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
