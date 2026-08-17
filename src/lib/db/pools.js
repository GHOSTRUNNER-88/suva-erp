import mysql from "mysql2/promise";

/**
 * Every tenant (Company, Organization) is a separate physical MySQL
 * database, resolved dynamically by name at request time — there's no
 * single fixed connection for "the app". This module owns one pooled
 * mysql2 connection per database name, cached so repeated calls (and
 * Next.js dev's hot module reloading) reuse the same pool instead of
 * silently leaking new ones on every reload.
 */

const globalForPools = globalThis;

function poolCache() {
  if (!globalForPools.__suvaPoolCache) {
    globalForPools.__suvaPoolCache = new Map();
  }
  return globalForPools.__suvaPoolCache;
}

/**
 * Returns the cached pool for `databaseName`, creating it on first use.
 * Callers should validate `databaseName` themselves (see provision.js) —
 * this function trusts its input and does not escape it, since mysql2
 * pool config isn't part of a SQL string.
 */
export function getPool(databaseName) {
  if (!databaseName) {
    throw new Error("getPool() requires a database name");
  }

  const cache = poolCache();
  const existing = cache.get(databaseName);
  if (existing) {
    return existing;
  }

  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? "",
    database: databaseName,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_LIMIT ?? 10),
    queueLimit: 0,
    dateStrings: true,
  });

  cache.set(databaseName, pool);
  return pool;
}

/**
 * Pool with no default database selected — the only way to run
 * `CREATE DATABASE` (a normal pool is pinned to one database). Cached
 * separately from per-database pools under a reserved key.
 */
export function getAdminPool() {
  const cache = poolCache();
  const key = "__admin__no_database_selected__";
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? "",
    waitForConnections: true,
    connectionLimit: 3,
    queueLimit: 0,
  });

  cache.set(key, pool);
  return pool;
}

export function masterDatabaseName() {
  const name = process.env.DB_MASTER_NAME;
  if (!name) {
    throw new Error("DB_MASTER_NAME is not set in the environment");
  }
  return name;
}
