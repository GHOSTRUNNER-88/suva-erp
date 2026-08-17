import {
  mysqlTable,
  int,
  varchar,
  mysqlEnum,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/**
 * The ONE fixed database in the whole system. Holds nothing but the
 * directory of Companies (tenants) and enough licensing info to gate
 * access — every other table in the app lives inside a per-Company or
 * per-Organization database instead. See src/lib/db/index.js.
 */
export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),

  name: varchar("name", { length: 180 }).notNull(),
  // URL segment today (localhost:3000/[slug]/*), subdomain later
  // ([slug].suvacorp.com.np) — same slug drives both.
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  panNumber: varchar("pan_number", { length: 20 }).unique(),
  // Physical database name for this Company's own db (users/roles/orgs).
  companyDbName: varchar("company_db_name", { length: 64 }).notNull().unique(),

  planCode: varchar("plan_code", { length: 60 }),
  status: mysqlEnum("status", ["trial", "active", "suspended", "cancelled"])
    .notNull()
    .default("trial"),
  maxUsers: int("max_users").notNull().default(5),
  maxOrganizations: int("max_organizations").notNull().default(5),
  expiresAt: timestamp("expires_at"),
  // JSON array of module keys (see src/lib/modules.js) this Company has
  // enabled at the account level — the Module Store. An Organization can
  // only turn on a module for itself if it's in this list first (see
  // organizations.enabledModules in db/schema/company.js).
  purchasedModules: text("purchased_modules"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

/**
 * The ONLY place a Firebase identity is linked to a Company — needed
 * because a Firebase UID by itself doesn't say which Company (physical
 * database) to even connect to. Login flow: verify the Firebase ID
 * token/session cookie -> get uid -> look up here -> now you know which
 * companyDbName to open and which local `users` row (companyUserId) that
 * uid maps to inside it.
 *
 * Product rule: ONE ACCOUNT -> ONE COMPANY -> MULTIPLE ORGANIZATIONS.
 * So firebase_uid is globally unique here; multiple Organizations live
 * inside that Company's own database, not as multiple master memberships.
 */
export const companyMembers = mysqlTable(
  "company_members",
  {
    id: int("id").autoincrement().primaryKey(),

    firebaseUid: varchar("firebase_uid", { length: 128 }).notNull(),
    companyId: int("company_id")
      .notNull()
      .references(() => companies.id),
    // The id of this person's row in that Company's own `users` table.
    companyUserId: int("company_user_id").notNull(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_company_members_firebase_uid").on(table.firebaseUid),
    uniqueIndex("uq_company_members_uid_company").on(table.firebaseUid, table.companyId),
  ]
);
