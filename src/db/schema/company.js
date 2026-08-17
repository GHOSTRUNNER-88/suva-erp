import {
  mysqlTable,
  int,
  varchar,
  mysqlEnum,
  tinyint,
  date,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/**
 * Schema applied to EVERY Company database (one physical database per
 * Company/tenant). Holds the Company's own login accounts and the
 * directory of its Organizations — actual ERP data lives in each
 * Organization's own database instead (see organization.js).
 *
 * Role/permission granularity (matching the legacy app's role -> category
 * access map) is intentionally not modeled yet — `role` is a simple enum
 * until the module-level permission system is built.
 *
 * Identity (password/Google) is Firebase's job, not ours — `firebaseUid`
 * is the only credential-shaped thing stored here, and it's opaque to us.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),

  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }),
  email: varchar("email", { length: 190 }).notNull().unique(),
  phoneNumber: varchar("phone_number", { length: 20 }),
  firebaseUid: varchar("firebase_uid", { length: 128 }).notNull().unique(),

  role: mysqlEnum("role", ["owner", "admin", "member"]).notNull().default("member"),
  isActive: tinyint("is_active").notNull().default(1),

  lastOrganizationId: int("last_organization_id"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),

  name: varchar("name", { length: 180 }).notNull(),
  // Machine-translated (MyMemory API) at write time in
  // createOrganizationAction/updateOrganizationAction — never translated
  // live on page read. Nullable: falls back to `name` when absent (API
  // failure, or not yet backfilled for rows written before this existed).
  nameNe: varchar("name_ne", { length: 180 }),
  industry: varchar("industry", { length: 120 }),
  address: text("address"),
  addressNe: text("address_ne"),
  accountingStartDate: date("accounting_start_date"),
  isVatRegistered: tinyint("is_vat_registered").notNull().default(0),
  email: varchar("email", { length: 190 }),
  phoneNumber: varchar("phone_number", { length: 30 }),
  panNumber: varchar("pan_number", { length: 20 }),
  website: varchar("website", { length: 190 }),
  // Firebase Storage download URL — see lib/firebase/upload-logo.js.
  logoUrl: varchar("logo_url", { length: 500 }),
  enabledFeatures: text("enabled_features"),
  // JSON array of module keys (see src/lib/modules.js) this specific
  // Organization uses — always a subset of the Company's
  // companies.purchasedModules (the Module Store), enforced in
  // updateOrganizationModulesAction, not just by the UI.
  enabledModules: text("enabled_modules"),
  // Physical database name for this Organization's own db (the actual ERP data).
  organizationDbName: varchar("organization_db_name", { length: 64 })
    .notNull()
    .unique(),

  fiscalYearStart: date("fiscal_year_start"),
  isDefault: tinyint("is_default").notNull().default(0),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const organizationUsers = mysqlTable(
  "organization_users",
  {
    id: int("id").autoincrement().primaryKey(),

    organizationId: int("organization_id").notNull(),
    userId: int("user_id").notNull(),
    role: mysqlEnum("role", ["owner", "admin", "member"]).notNull().default("member"),
    status: mysqlEnum("status", ["active", "invited", "disabled"]).notNull().default("active"),
    // JSON array of module keys (see src/lib/modules.js). Only meaningful
    // when role = "member" — owner/admin always have full access to every
    // module the organization has enabled, see src/lib/permissions.js.
    modulePermissions: text("module_permissions"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("uq_organization_users_org_user").on(table.organizationId, table.userId),
  ]
);
