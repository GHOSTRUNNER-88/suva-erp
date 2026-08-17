import {
  mysqlTable,
  int,
  varchar,
  text,
  decimal,
  tinyint,
  date,
  timestamp,
  uniqueIndex,
  index,
  mysqlEnum,
  foreignKey,
} from "drizzle-orm/mysql-core";

/**
 * Schema applied to EVERY Organization database (one physical database
 * per business unit). This is where actual ERP data will live — sales,
 * purchase, inventory, parties, banking, VAT, payroll, etc. — built out
 * module by module. For now it only has the single-row `settings` table,
 * since every later module depends on it (VAT defaults, currency, fiscal
 * year, document prefixes) — see legacy's Settings.sql/Settings.php for
 * the reference this is adapted from.
 */
export const settings = mysqlTable("settings", {
  id: int("id").autoincrement().primaryKey(),

  organizationName: varchar("organization_name", { length: 255 }).notNull().default(""),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 100 }),
  panNumber: varchar("pan_number", { length: 50 }),
  logoPath: varchar("logo_path", { length: 255 }),

  currencySymbol: varchar("currency_symbol", { length: 10 }).notNull().default("NPR"),
  invoicePrefix: varchar("invoice_prefix", { length: 20 }).notNull().default("INV"),
  billPrefix: varchar("bill_prefix", { length: 20 }).notNull().default("BILL"),

  defaultVatEnabled: tinyint("default_vat_enabled").notNull().default(1),
  defaultVatPercent: decimal("default_vat_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("13.00"),

  fiscalYearStart: date("fiscal_year_start"),
  negativeStockAction: tinyint("negative_stock_action").notNull().default(1),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const units = mysqlTable(
  "units",
  {
    id: int("unit_id").autoincrement().primaryKey(),
    name: varchar("unit_name", { length: 50 }).notNull(),
    code: varchar("unit_code", { length: 20 }).notNull(),
    type: varchar("unit_type", { length: 30 }),
    isActive: tinyint("is_active").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("uq_unit_name").on(table.name),
    uniqueIndex("uq_unit_code").on(table.code),
  ]
);

/**
 * Ported from legacy `party_levels`/`parties` (APP-REPORT.md §7.4) — schema
 * only, field-for-field, no invented columns (see ../../AGENTS.md §6: port
 * exact, don't "improve"). Renamed to "party groups" in this app's UI/code
 * (legacy calls it "party level") — a naming choice, not a logic change,
 * see ../../AGENTS.md §6 ("UI/UX is not locked to the legacy look").
 * `parties.balance` is a denormalized running ledger cache, signed
 * Dr(+)/Cr(-) — see ../../AGENTS.md §6's "Party ledger balance is signed"
 * note. It must be recalculated by one shared routine once ledger-writing
 * modules (sales/purchase/payments) exist, never accumulated ad hoc per
 * screen — that routine doesn't exist yet, this is schema only.
 *
 * `item_unit_conversions` and `item_party_level_prices` are narrowed to
 * match what this app's Items schema actually supports: legacy's
 * item_unit_conversions is a general from_unit/to_unit table (for arbitrary
 * multi-unit variants); since items here only ever have one primary + one
 * optional secondary unit, that's folded into a single
 * `items.conversion_factor` column instead of recreating the general table.
 * item_party_level_prices ported as-is (renamed to match this app's
 * partyGroups) since it's inherently a sparse item×group map, not something
 * that flattens onto one row.
 *
 * Attributes/values (attributes, product_variants, item_variants — see
 * below) are now ported too, with two deliberate departures from the
 * legacy shape, both verified against the actual model code
 * (legacy-erp-kick/models/Item.php), not just the schema summary:
 * - `product_variants` is renamed `attributeValues` here. It stores VALUES
 *   under an attribute (e.g. "Red" under "Color"), not full item variant
 *   combinations — legacy's name reads as the latter and isn't, exactly
 *   the kind of confusing legacy name AGENTS.md §6 allows renaming (logic
 *   unchanged, name clarified).
 * - legacy's `item_variant_map` (item_id, attr_id, variant_id) is NOT
 *   ported — it's fully redundant with `item_variants` (attr_id is always
 *   derivable via the value's own attrId) and nothing in Item.php's actual
 *   functions (sync_item_variants, load_item_variants, add_item_variant,
 *   clear_item_variants) reads or writes it. Porting a table nothing
 *   touches isn't "porting exactly," it's copying dead weight.
 * Still deliberately NOT ported: full multi-attribute variant *combinations*
 * as distinct stockable SKUs, and per-variant inventory
 * (sync_item_inventory_for_variants) — legacy tracks stock per individual
 * attribute value, not per combination, which only matters once Sales/
 * Purchase exist to actually consume that stock. This increment is just
 * "define attributes and their values, and tag which values apply to an
 * item" — see items/attributes/actions.js.
 */
export const partyGroups = mysqlTable(
  "party_groups",
  {
    id: int("group_id").autoincrement().primaryKey(),
    name: varchar("group_name", { length: 150 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [uniqueIndex("uq_party_group_name").on(table.name)]
);

// Trimmed down from legacy's full parties schema (see block comment
// above) at the user's explicit request — no invented columns beyond
// what's actually used. Opening balance / signed running balance came
// back in at the user's later request (party ledger view) — legacy
// semantics preserved: opening_balance_type Dr/Cr + opening_balance is the
// true starting point, balance is a denormalized signed cache
// (positive = Dr, negative = Cr) recomputed on every write. Until a
// ledger-writing module (sales/purchase/payments) exists, balance always
// just equals the signed opening balance — see actions.js.
export const parties = mysqlTable(
  "parties",
  {
    id: int("party_id").autoincrement().primaryKey(),
    name: varchar("party_name", { length: 225 }).notNull(),
    type: mysqlEnum("party_type", ["Customer", "Supplier", "Both"]).notNull().default("Customer"),
    phoneNumber: varchar("phone_number", { length: 20 }),
    address: text("address"),
    panNumber: varchar("pan_number", { length: 50 }),
    partyGroupId: int("party_group_id").references(() => partyGroups.id, { onDelete: "set null" }),
    openingBalance: decimal("opening_balance", { precision: 14, scale: 2 }).notNull().default("0.00"),
    openingBalanceType: mysqlEnum("opening_balance_type", ["Dr", "Cr"]).notNull().default("Dr"),
    balance: decimal("balance", { precision: 14, scale: 2 }).notNull().default("0.00"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("uq_party_name").on(table.name),
    index("idx_party_type").on(table.type),
    index("idx_party_phone").on(table.phoneNumber),
    index("idx_party_balance").on(table.balance),
    index("idx_party_group_id").on(table.partyGroupId),
    index("idx_party_type_name").on(table.type, table.name),
  ]
);

/**
 * Ported from legacy `item_categories`/`warehouses`/`items`/`inventories`
 * (APP-REPORT.md §7.3), schema only — same fidelity note as Parties above.
 */
export const itemCategories = mysqlTable(
  "item_categories",
  {
    id: int("category_id").autoincrement().primaryKey(),
    name: varchar("category_name", { length: 150 }).notNull(),
    description: text("description"),
    // Not in the legacy schema — a new addition (user request), not a
    // divergence from ported logic. Stores a lucide-react component name
    // (see components/ui/icon-picker.jsx), picked from a curated list
    // rather than typed, since nobody has lucide's icon names memorized.
    icon: varchar("icon", { length: 50 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [uniqueIndex("uq_item_category_name").on(table.name)]
);

export const warehouses = mysqlTable(
  "warehouses",
  {
    id: int("warehouse_id").autoincrement().primaryKey(),
    isPrimary: tinyint("primary_warehouse").notNull().default(0),
    name: varchar("warehouse_name", { length: 225 }).notNull(),
    type: mysqlEnum("warehouse_type", [
      "Godown",
      "Retail Store",
      "Wholesale Store",
      "Assembly Plant",
      "Others",
    ])
      .notNull()
      .default("Godown"),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
    storeAddress: varchar("store_address", { length: 225 }),
    invoicePrefix: varchar("invoice_prefix", { length: 10 }).notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("uq_warehouse_name").on(table.name),
    uniqueIndex("uq_warehouse_phone").on(table.phoneNumber),
  ]
);

export const items = mysqlTable(
  "items",
  {
    id: int("item_id").autoincrement().primaryKey(),
    name: varchar("item_name", { length: 225 }).notNull(),
    categoryId: int("category_id").references(() => itemCategories.id, { onDelete: "set null" }),
    barcodeInput: tinyint("barcode_input").notNull().default(0),
    barcodeValue: varchar("barcode_value", { length: 225 }),
    primaryUnitId: int("primary_unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    secondaryUnitId: int("secondary_unit_id").references(() => units.id, { onDelete: "restrict" }),
    // How many secondaryUnit make up 1 primaryUnit — "1 primaryUnit =
    // conversionFactor secondaryUnit" (e.g. primary=Box, secondary=Pcs,
    // conversionFactor=12 -> 1 Box = 12 Pcs). Only meaningful when
    // secondaryUnitId is set — enforced in actions.js, not here, matching
    // legacy's CHECK(conversion_factor > 0) intent without a DB-level
    // conditional constraint.
    conversionFactor: int("conversion_factor"),
    purchasePrice: decimal("purchase_price", { precision: 14, scale: 5 }).notNull().default("0.00000"),
    sellingPrice: decimal("selling_price", { precision: 14, scale: 5 }).notNull().default("0.00000"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_items_name").on(table.name),
    index("idx_items_category_name").on(table.categoryId, table.name),
    index("idx_items_barcode").on(table.barcodeValue),
  ]
);

// Ported from legacy item_party_level_prices (APP-REPORT.md §7.3), renamed
// to match partyGroups. Per-item, per-group selling-price override — sparse
// (only rows that actually override the item's base sellingPrice exist),
// synced wholesale on every item save (see items/actions.js), same pattern
// as legacy's save_item_party_level_prices.
export const itemPartyGroupPrices = mysqlTable(
  "item_party_group_prices",
  {
    id: int("id").autoincrement().primaryKey(),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    partyGroupId: int("party_group_id")
      .notNull()
      .references(() => partyGroups.id, { onDelete: "cascade" }),
    sellingPrice: decimal("selling_price", { precision: 14, scale: 5 }).notNull().default("0.00000"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [uniqueIndex("uq_item_party_group").on(table.itemId, table.partyGroupId)]
);

// Ported from legacy `attributes` (APP-REPORT.md §7.3 / ProductAttributes.sql)
export const attributes = mysqlTable(
  "attributes",
  {
    id: int("attr_id").autoincrement().primaryKey(),
    name: varchar("attr_name", { length: 50 }).notNull(),
    // Auto-derived from name server-side (see items/attributes/actions.js) —
    // legacy exposes a manual-override toggle in its UI ("Auto generate
    // slug", checked by default); this app just always auto-generates it,
    // since it's an internal identifier ("used for internal clean naming"
    // per legacy's own field hint), not something worth a form field.
    slug: varchar("attr_slug", { length: 50 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [uniqueIndex("uq_attr_name").on(table.name), uniqueIndex("uq_attr_slug").on(table.slug)]
);

// Ported from legacy `product_variants` — renamed attributeValues, see the
// block comment above partyGroups for why.
export const attributeValues = mysqlTable(
  "attribute_values",
  {
    id: int("value_id").autoincrement().primaryKey(),
    attrId: int("attr_id")
      .notNull()
      .references(() => attributes.id, { onDelete: "cascade" }),
    name: varchar("value_name", { length: 50 }).notNull(),
    slug: varchar("value_slug", { length: 50 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("uq_attribute_value_attr_name").on(table.attrId, table.name),
    uniqueIndex("uq_attribute_value_attr_slug").on(table.attrId, table.slug),
  ]
);

// Ported from legacy `item_variants` — which attribute values apply to an
// item (e.g. this T-shirt comes in Red/Blue and S/M/L). legacy's
// `item_variant_map` is not ported — see the block comment above.
export const itemAttributeValues = mysqlTable(
  "item_attribute_values",
  {
    id: int("item_variant_id").autoincrement().primaryKey(),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    valueId: int("value_id")
      .notNull()
      .references(() => attributeValues.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uq_item_attribute_value").on(table.itemId, table.valueId)]
);

export const inventories = mysqlTable(
  "inventories",
  {
    id: int("inventory_id").autoincrement().primaryKey(),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    // 0 = "no variant" sentinel, NOT NULL — deliberately unlike the (not
    // yet ported) detail-table convention of NULL = no variant, see
    // ../../AGENTS.md §6's migration-script gotchas.
    variantId: int("variant_id").notNull().default(0),
    warehouseId: int("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    unitId: int("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    quantity: decimal("quantity", { precision: 14, scale: 4 }).notNull().default("0.0000"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("uq_inventory_item_variant_warehouse").on(table.itemId, table.variantId, table.warehouseId),
    index("idx_inv_warehouse").on(table.warehouseId),
    index("idx_inv_item").on(table.itemId),
    index("idx_inv_warehouse_qty").on(table.warehouseId, table.quantity),
    index("idx_inv_item_warehouse_qty").on(table.itemId, table.warehouseId, table.quantity),
    index("idx_inv_qty").on(table.quantity),
  ]
);

// Ported from legacy `bank_accounts` (APP-REPORT.md §7.5 / bank_accounts.sql)
// — bank/cash account master. `qrCodeUrl` stores a path under this app's own
// `public/uploads/` (server-filesystem, not Firebase Storage — see
// bank-accounts/actions.js's uploadBankQrCodeAction) rather than legacy's
// bare `qr_code` filename column, since the URL already carries everything
// needed to render it.
export const bankAccounts = mysqlTable(
  "bank_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    displayName: varchar("display_name", { length: 150 }),
    bankName: varchar("bank_name", { length: 150 }).notNull(),
    // Not the live balance — that's always derived from bankTransactions
    // (see getBankAccountBalance in bank-accounts/actions.js). This is only
    // the figure the account started from, kept for display/edit and to
    // (re)seed the ledger's own 'opening_balance' row.
    openingBalance: decimal("opening_balance", { precision: 15, scale: 2 }).notNull().default("0.00"),
    asOfDate: date("as_of_date").notNull(),
    printOnInvoice: tinyint("print_on_invoice").notNull().default(0),
    accountNumber: varchar("account_number", { length: 100 }),
    accountHolderName: varchar("account_holder_name", { length: 150 }),
    branch: varchar("branch", { length: 150 }),
    qrCodeUrl: varchar("qr_code_url", { length: 500 }),
    status: mysqlEnum("status", ["active", "inactive"]).notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_bank_status_name").on(table.status, table.bankName, table.displayName),
    index("idx_bank_print_status").on(table.printOnInvoice, table.status),
  ]
);

// Ported from legacy `bank_transactions` — full ledger of money movement
// through a bank/cash account. `transactionRefId` is a deliberately
// unenforced polymorphic reference (sales/purchase/payment/expense/credit-
// or-debit-note id, depending on transactionType) — same pattern as several
// other polymorphic refs flagged in ../../AGENTS.md §6's migration-script
// gotchas, kept exactly as legacy has it (no FK, validate at the read site).
// Only 'opening_balance' and 'transfer' rows are ever written by this app
// today (see bank-accounts/actions.js) — the rest of the enum exists so
// Sales/Purchase/Finance/Payroll/Maskebari can post into this same ledger
// once those modules are built, without a schema change.
export const bankTransactions = mysqlTable(
  "bank_transactions",
  {
    id: int("id").autoincrement().primaryKey(),
    bankAccountId: int("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    txnDate: date("txn_date").notNull(),
    txnType: mysqlEnum("txn_type", ["credit", "debit"]).notNull(),
    transactionType: mysqlEnum("transaction_type", [
      "sales",
      "purchase",
      "payment_in",
      "payment_out",
      "expense",
      "opening_balance",
      "transfer",
      "credit_note",
      "debit_note",
      "manual",
      "vat_payment",
    ]).notNull(),
    transactionRefId: int("transaction_ref_id"),
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
    referenceNo: varchar("reference_no", { length: 100 }),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_bank_account_id").on(table.bankAccountId),
    index("idx_transaction_type").on(table.transactionType),
    index("idx_transaction_ref_id").on(table.transactionRefId),
    index("idx_txn_date").on(table.txnDate),
    index("idx_bt_account_date_id").on(table.bankAccountId, table.txnDate, table.id),
    index("idx_bt_type_ref").on(table.transactionType, table.transactionRefId),
    index("idx_bt_date_id").on(table.txnDate, table.id),
  ]
);

// New table, no legacy equivalent — legacy's `inventories` (above) is a
// pure current-quantity snapshot with no movement history at all (confirmed
// against models/Inventory.php: set_inventory/adjust_inventory only ever
// write the running quantity, nothing records *why* it changed). This adds
// an audit trail for the Inventory page's stock ledger, written by
// items/inventory/actions.js's writeInventoryDelta alongside every
// inventories.quantity write — quantityAfter is a snapshot at write time
// (not recomputed by replaying history), since inventories.quantity
// already is the authoritative current value; this table is additive,
// not a second source of truth for balance the way bankTransactions is
// for bank accounts.
// itemId/warehouseId are deliberately `restrict`, not `cascade` — an audit
// log that silently disappears when the thing it's auditing gets deleted
// defeats its own purpose (code review caught this: cascade would let
// deleting an item erase every record of its stock history with no trace).
// Practical effect: deleteItemsAction/deleteWarehousesAction will fail with
// a raw FK error if the item/warehouse has any logged stock movement — a
// blocked delete beats a silently vanished audit trail, but a friendlier
// "can't delete, has stock history" message is a reasonable follow-up, not
// done here.
export const inventoryTransactions = mysqlTable(
  "inventory_transactions",
  {
    id: int("id").autoincrement().primaryKey(),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    variantId: int("variant_id").notNull().default(0),
    warehouseId: int("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    changeType: mysqlEnum("change_type", [
      "set",
      "add",
      "remove",
      "transfer_in",
      "transfer_out",
      "sale",
      "sales_return",
      "purchase",
      "purchase_return",
      "challan_out",
      "challan_in",
    ]).notNull(),
    quantityChange: decimal("quantity_change", { precision: 14, scale: 4 }).notNull(),
    quantityAfter: decimal("quantity_after", { precision: 14, scale: 4 }).notNull(),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_inv_txn_lookup").on(table.itemId, table.variantId, table.warehouseId, table.createdAt),
  ]
);

/**
 * Sales / Purchase / Finance transactional core — ported from legacy
 * APP-REPORT.md §7.1 (Sales), §7.2 (Purchase), §7.5 (Finance/Banking),
 * §7.6 (Expenses), verified against the actual model files (models/*.php),
 * not just the schema summary — see ../../AGENTS.md §6 for why that
 * distinction matters (e.g. the "quantity always rounded to int" quirk only
 * shows up in the model code, never in the SQL column type).
 *
 * Shared conventions across every document pair below (header + *Details):
 * - header.partyId -> parties: restrict (never silently orphan a ledger row)
 * - header.bankAccountId / warehouseId -> set null (optional references)
 * - detail.headerId -> header: cascade (deleting a header deletes its lines)
 * - detail.itemId -> items: restrict, detail.unitId -> units: restrict
 * - detail.variantId -> attributeValues: set null, NULLABLE (unlike
 *   inventories.variantId's NOT NULL DEFAULT 0 sentinel — see
 *   ../../AGENTS.md §6's migration-script gotchas; callers must coerce
 *   null -> 0 at the inventories/inventoryTransactions boundary, never mix
 *   the two conventions).
 * - Every subtotal/discAmount/vatAmount/totalAmount is DECIMAL(14,2),
 *   discPercent DECIMAL(8,2), vatPercent DECIMAL(5,2), rate DECIMAL(14,5) —
 *   matching legacy exactly. Money math itself lives in lib/money.js (one
 *   shared calculator, not reimplemented per module) per ../../AGENTS.md §5.
 * - Line quantity type mirrors legacy's own inconsistency deliberately:
 *   plain INT on order/quotation details (legacy never stored fractional
 *   order quantities), DECIMAL(14,2) on invoice/bill/credit/debit details,
 *   DECIMAL(15,4) on delivery challan items — even though every create/update
 *   path rounds to a whole number before saving in all of them. Don't
 *   "clean up" the inconsistency; it's a verified legacy quirk, not a bug.
 * - Document numbering: invoice/bill/credit-note/debit-note/challan use
 *   MAX(id)+1 zero-padded to 4 digits with an optional per-warehouse prefix
 *   override (warehouses.invoicePrefix) falling back to a fixed prefix —
 *   see lib/document-numbering.js. Purchase bills additionally allow a
 *   manual override of the generated number (to record the supplier's own
 *   VAT bill number). Orders/quotations get the same auto-suggested number
 *   but the field stays free-text with an application-level uniqueness
 *   check rather than a DB-enforced one (legacy has no UNIQUE constraint on
 *   order_number/quotation_number in the schema despite the report's index
 *   name suggesting otherwise — verified against PurchaseOrders.sql /
 *   SalesOrders.sql / SalesQuotations.sql column lists).
 */

// Ported from legacy `expense_categories` (APP-REPORT.md §7.6). Seeded with
// 10 fixed rows on every new Organization (see setup/actions.js) — Salary,
// Rent, Utilities, Transportation (TA/DA), Office Supplies, Maintenance &
// Repairs, Marketing & Advertising, Meals & Entertainment, Insurance,
// Miscellaneous — matching legacy's INSERT IGNORE seed exactly. "Salary" is
// load-bearing: expense VAT is force-disabled server-side when the category
// name is "Salary" (case-insensitive) and payroll staff payments post as an
// Expense in this exact category (see ../../AGENTS.md §6) — don't rename it.
export const expenseCategories = mysqlTable(
  "expense_categories",
  {
    id: int("category_id").autoincrement().primaryKey(),
    name: varchar("category_name", { length: 150 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [uniqueIndex("uq_expense_category_name").on(table.name)]
);

// Ported from legacy `expenses` (APP-REPORT.md §7.6 / models/Expense.php).
// `voucherNumber` is always server-assigned (MAX+1, plain sequential int,
// never client-editable) — `expenseNumber` is user-editable free text,
// uniqueness scoped per party (or globally among party-less expenses),
// enforced at the application layer only (legacy has no DB UNIQUE on this
// column, confirmed against Expenses.sql). `subtotal` mirrors
// `taxableAmount` exactly (NOT taxable+nonTaxable — verified against
// create_expense()'s insert) — VAT is computed on taxableAmount only;
// `amount` (grand total) = taxableAmount + nonTaxableAmount + vatAmount.
// A bank_transactions debit row is only created when bankAccountId is set
// AND amount > 0 — an expense with no bank account is recorded but never
// touches the bank ledger (e.g. a payable expense to settle later).
export const expenses = mysqlTable(
  "expenses",
  {
    id: int("expense_id").autoincrement().primaryKey(),
    voucherNumber: int("voucher_number").notNull(),
    expenseNumber: varchar("expense_number", { length: 50 }).notNull(),
    expenseDate: date("expense_date").notNull(),
    categoryId: int("category_id").references(() => expenseCategories.id, { onDelete: "set null" }),
    partyId: int("party_id").references(() => parties.id, { onDelete: "set null" }),
    description: varchar("description", { length: 500 }),
    taxableAmount: decimal("taxable_amount", { precision: 14, scale: 5 }).notNull().default("0.00000"),
    nonTaxableAmount: decimal("non_taxable_amount", { precision: 14, scale: 5 }).notNull().default("0.00000"),
    subtotal: decimal("subtotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
    vatPercent: decimal("vat_percent", { precision: 5, scale: 2 }),
    vatAmount: decimal("vat_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    isVatApplicable: tinyint("is_vat_applicable").notNull().default(0),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    bankAccountId: int("bank_account_id").references(() => bankAccounts.id, { onDelete: "set null" }),
    referenceNo: varchar("reference_no", { length: 100 }),
    notes: text("notes"),
    status: mysqlEnum("status", ["draft", "completed", "cancelled"]).notNull().default("completed"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("uq_expense_voucher_number").on(table.voucherNumber),
    index("idx_expense_party_number").on(table.partyId, table.expenseNumber),
    index("idx_expense_date").on(table.expenseDate),
    index("idx_expense_category_id").on(table.categoryId),
    index("idx_expense_party_id").on(table.partyId),
    index("idx_expense_date_status").on(table.expenseDate, table.status),
    index("idx_expense_bank_date").on(table.bankAccountId, table.expenseDate),
  ]
);

// Ported from legacy `purchase_orders` / `purchase_order_details`
// (APP-REPORT.md §7.2, mirrors sales_orders). No payment columns — an order
// is a workflow document only, never touches inventory or the party ledger
// until it's converted into a Purchase Bill.
export const purchaseOrders = mysqlTable(
  "purchase_orders",
  {
    id: int("order_id").autoincrement().primaryKey(),
    orderNumber: varchar("order_number", { length: 50 }).notNull(),
    orderDate: date("order_date").notNull(),
    expectedDate: date("expected_date"),
    partyId: int("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "restrict" }),
    supplierName: varchar("supplier_name", { length: 225 }),
    supplierAddress: text("supplier_address"),
    panNumber: varchar("pan_number", { length: 50 }),
    warehouseId: int("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }),
    subtotal: decimal("subtotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
    discType: mysqlEnum("disc_type", ["percent", "amount"]).notNull().default("percent"),
    discPercent: decimal("disc_percent", { precision: 8, scale: 2 }).notNull().default("0.00"),
    discAmount: decimal("disc_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    vatPercent: decimal("vat_percent", { precision: 5, scale: 2 }),
    isVatApplicable: tinyint("is_vat_applicable").notNull().default(0),
    vatAmount: decimal("vat_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    totalAmount: decimal("total_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    notes: text("notes"),
    status: mysqlEnum("status", ["draft", "ordered", "received", "cancelled"]).notNull().default("ordered"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_purchase_order_date").on(table.orderDate),
    index("idx_purchase_order_party").on(table.partyId),
    index("idx_purchase_order_status").on(table.status),
    index("idx_po_party_date_status").on(table.partyId, table.orderDate, table.status),
  ]
);

export const purchaseOrderDetails = mysqlTable(
  "purchase_order_details",
  {
    id: int("purchase_order_detail_id").autoincrement().primaryKey(),
    orderId: int("order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    variantId: int("variant_id").references(() => attributeValues.id, { onDelete: "set null" }),
    unitId: int("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    quantity: int("quantity").notNull().default(0),
    rate: decimal("rate", { precision: 14, scale: 5 }).notNull().default("0.00000"),
    discType: mysqlEnum("disc_type", ["percent", "amount"]).notNull().default("percent"),
    discPercent: decimal("disc_percent", { precision: 8, scale: 2 }).notNull().default("0.00"),
    discAmount: decimal("disc_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    lineSubtotal: decimal("line_subtotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
    lineTotal: decimal("line_total", { precision: 14, scale: 2 }).notNull().default("0.00"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_pod_order").on(table.orderId),
    index("idx_pod_item").on(table.itemId),
    index("idx_pod_variant").on(table.variantId),
  ]
);

// Ported from legacy `purchase_bills` / `purchase_bill_details`
// (APP-REPORT.md §7.2) — mirror of sales_invoices. `billNumber` allows a
// manual override of the auto-suggested number (to record the supplier's
// own VAT bill number) — see lib/document-numbering.js. Completing a bill
// increases inventory (opposite of a sales invoice) and posts a `purchase`
// credit to the party ledger (we owe the supplier), same
// recalculate-from-scratch pattern as every other document type here.
export const purchaseBills = mysqlTable(
  "purchase_bills",
  {
    id: int("bill_id").autoincrement().primaryKey(),
    billNumber: varchar("bill_number", { length: 50 }).notNull(),
    billDate: date("bill_date").notNull(),
    partyId: int("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "restrict" }),
    supplierName: varchar("supplier_name", { length: 225 }),
    supplierAddress: text("supplier_address"),
    panNumber: varchar("pan_number", { length: 50 }),
    bankAccountId: int("bank_account_id").references(() => bankAccounts.id, { onDelete: "set null" }),
    warehouseId: int("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }),
    subtotal: decimal("subtotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
    discType: mysqlEnum("disc_type", ["percent", "amount"]).notNull().default("percent"),
    discPercent: decimal("disc_percent", { precision: 8, scale: 2 }).notNull().default("0.00"),
    discAmount: decimal("disc_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    vatPercent: decimal("vat_percent", { precision: 5, scale: 2 }),
    isVatApplicable: tinyint("is_vat_applicable").notNull().default(0),
    vatAmount: decimal("vat_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    totalAmount: decimal("total_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    isPaid: tinyint("is_paid").notNull().default(1),
    paidAmount: decimal("paid_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    dueAmount: decimal("due_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    notes: text("notes"),
    status: mysqlEnum("status", ["draft", "completed", "cancelled"]).notNull().default("completed"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_bill_date").on(table.billDate),
    index("idx_bill_party_id").on(table.partyId),
    index("idx_bill_bank_account_id").on(table.bankAccountId),
    index("idx_bill_status").on(table.status),
    index("idx_pb_party_date_status").on(table.partyId, table.billDate, table.status),
  ]
);

export const purchaseBillDetails = mysqlTable(
  "purchase_bill_details",
  {
    id: int("purchase_bill_detail_id").autoincrement().primaryKey(),
    billId: int("bill_id")
      .notNull()
      .references(() => purchaseBills.id, { onDelete: "cascade" }),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    variantId: int("variant_id").references(() => attributeValues.id, { onDelete: "set null" }),
    unitId: int("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    quantity: decimal("quantity", { precision: 14, scale: 2 }).notNull().default("0.00"),
    rate: decimal("rate", { precision: 14, scale: 5 }).notNull().default("0.00000"),
    discType: mysqlEnum("disc_type", ["percent", "amount"]).notNull().default("percent"),
    discPercent: decimal("disc_percent", { precision: 8, scale: 2 }).notNull().default("0.00"),
    discAmount: decimal("disc_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    lineSubtotal: decimal("line_subtotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
    lineTotal: decimal("line_total", { precision: 14, scale: 2 }).notNull().default("0.00"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_pbd_bill_id").on(table.billId),
    index("idx_pbd_item_id").on(table.itemId),
    index("idx_pbd_variant_id").on(table.variantId),
  ]
);

// Ported from legacy `debit_notes` / `debit_note_details` (APP-REPORT.md
// §7.2) — purchase returns issued to a supplier. Posts a debit to the party
// ledger (supplier owes us) and decreases inventory (goods physically
// leaving, back to the supplier) — same negative-stock 3-way gate as any
// other stock-out. `isRefunded`/`refundAmount` records whether the supplier
// actually paid cash back via `bankAccountId` (separate from, and
// additional to, the party-ledger debit posted regardless).
export const debitNotes = mysqlTable(
  "debit_notes",
  {
    id: int("debit_note_id").autoincrement().primaryKey(),
    debitNoteNumber: varchar("debit_note_number", { length: 50 }).notNull(),
    debitNoteDate: date("debit_note_date").notNull(),
    partyId: int("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "restrict" }),
    referenceNo: varchar("reference_no", { length: 100 }),
    supplierName: varchar("supplier_name", { length: 225 }),
    supplierAddress: text("supplier_address"),
    warehouseId: int("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }),
    subtotal: decimal("subtotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
    discType: mysqlEnum("disc_type", ["percent", "amount"]).notNull().default("percent"),
    discPercent: decimal("disc_percent", { precision: 8, scale: 2 }).notNull().default("0.00"),
    discAmount: decimal("disc_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    vatPercent: decimal("vat_percent", { precision: 5, scale: 2 }),
    isVatApplicable: tinyint("is_vat_applicable").notNull().default(0),
    vatAmount: decimal("vat_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    totalAmount: decimal("total_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    isRefunded: tinyint("is_refunded").notNull().default(0),
    refundAmount: decimal("refund_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    bankAccountId: int("bank_account_id").references(() => bankAccounts.id, { onDelete: "set null" }),
    notes: text("notes"),
    status: mysqlEnum("status", ["draft", "completed", "cancelled"]).notNull().default("completed"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_dn_date").on(table.debitNoteDate),
    index("idx_dn_party_id").on(table.partyId),
    index("idx_dn_party_date_status").on(table.partyId, table.debitNoteDate, table.status),
  ]
);

export const debitNoteDetails = mysqlTable(
  "debit_note_details",
  {
    id: int("debit_note_detail_id").autoincrement().primaryKey(),
    debitNoteId: int("debit_note_id")
      .notNull()
      .references(() => debitNotes.id, { onDelete: "cascade" }),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    variantId: int("variant_id").references(() => attributeValues.id, { onDelete: "set null" }),
    unitId: int("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    quantity: decimal("quantity", { precision: 14, scale: 2 }).notNull().default("0.00"),
    rate: decimal("rate", { precision: 14, scale: 5 }).notNull().default("0.00000"),
    discType: mysqlEnum("disc_type", ["percent", "amount"]).notNull().default("percent"),
    discPercent: decimal("disc_percent", { precision: 8, scale: 2 }).notNull().default("0.00"),
    discAmount: decimal("disc_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    lineSubtotal: decimal("line_subtotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
    lineTotal: decimal("line_total", { precision: 14, scale: 2 }).notNull().default("0.00"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [index("idx_dnd_dn_id").on(table.debitNoteId), index("idx_dnd_item").on(table.itemId)]
);

// Ported from legacy `sales_orders` / `sales_order_details` (APP-REPORT.md
// §7.1). Same workflow-only shape as purchase_orders — no payment columns,
// no inventory/ledger effect until converted into a Sales Invoice.
export const salesOrders = mysqlTable(
  "sales_orders",
  {
    id: int("order_id").autoincrement().primaryKey(),
    orderNumber: varchar("order_number", { length: 50 }).notNull(),
    orderDate: date("order_date").notNull(),
    expectedDate: date("expected_date"),
    partyId: int("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "restrict" }),
    billingName: varchar("billing_name", { length: 225 }),
    billingAddress: text("billing_address"),
    panNumber: varchar("pan_number", { length: 50 }),
    warehouseId: int("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }),
    subtotal: decimal("subtotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
    discType: mysqlEnum("disc_type", ["percent", "amount"]).notNull().default("percent"),
    discPercent: decimal("disc_percent", { precision: 8, scale: 2 }).notNull().default("0.00"),
    discAmount: decimal("disc_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    vatPercent: decimal("vat_percent", { precision: 5, scale: 2 }),
    isVatApplicable: tinyint("is_vat_applicable").notNull().default(0),
    vatAmount: decimal("vat_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    totalAmount: decimal("total_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    notes: text("notes"),
    status: mysqlEnum("status", ["draft", "confirmed", "converted", "cancelled"]).notNull().default("confirmed"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_sales_order_date").on(table.orderDate),
    index("idx_sales_order_party").on(table.partyId),
    index("idx_sales_order_status").on(table.status),
    index("idx_so_party_date_status").on(table.partyId, table.orderDate, table.status),
  ]
);

export const salesOrderDetails = mysqlTable(
  "sales_order_details",
  {
    id: int("sales_order_detail_id").autoincrement().primaryKey(),
    orderId: int("order_id")
      .notNull()
      .references(() => salesOrders.id, { onDelete: "cascade" }),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    variantId: int("variant_id").references(() => attributeValues.id, { onDelete: "set null" }),
    unitId: int("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    quantity: int("quantity").notNull().default(0),
    rate: decimal("rate", { precision: 14, scale: 5 }).notNull().default("0.00000"),
    discType: mysqlEnum("disc_type", ["percent", "amount"]).notNull().default("percent"),
    discPercent: decimal("disc_percent", { precision: 8, scale: 2 }).notNull().default("0.00"),
    discAmount: decimal("disc_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    lineSubtotal: decimal("line_subtotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
    lineTotal: decimal("line_total", { precision: 14, scale: 2 }).notNull().default("0.00"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_sod_order").on(table.orderId),
    index("idx_sod_item").on(table.itemId),
    index("idx_sod_variant").on(table.variantId),
  ]
);

// Ported from legacy `sales_quotations` / `sales_quotation_details`
// (APP-REPORT.md §7.1). Same shape as sales_orders plus `validUntil`.
export const salesQuotations = mysqlTable(
  "sales_quotations",
  {
    id: int("quotation_id").autoincrement().primaryKey(),
    quotationNumber: varchar("quotation_number", { length: 50 }).notNull(),
    quotationDate: date("quotation_date").notNull(),
    validUntil: date("valid_until"),
    partyId: int("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "restrict" }),
    billingName: varchar("billing_name", { length: 225 }),
    billingAddress: text("billing_address"),
    panNumber: varchar("pan_number", { length: 50 }),
    warehouseId: int("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }),
    subtotal: decimal("subtotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
    discType: mysqlEnum("disc_type", ["percent", "amount"]).notNull().default("percent"),
    discPercent: decimal("disc_percent", { precision: 8, scale: 2 }).notNull().default("0.00"),
    discAmount: decimal("disc_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    vatPercent: decimal("vat_percent", { precision: 5, scale: 2 }),
    isVatApplicable: tinyint("is_vat_applicable").notNull().default(0),
    vatAmount: decimal("vat_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    totalAmount: decimal("total_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    notes: text("notes"),
    status: mysqlEnum("status", ["draft", "sent", "accepted", "converted", "expired", "cancelled"])
      .notNull()
      .default("sent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_sales_quotation_date").on(table.quotationDate),
    index("idx_sales_quotation_party").on(table.partyId),
    index("idx_sales_quotation_status").on(table.status),
    index("idx_sq_party_date_status").on(table.partyId, table.quotationDate, table.status),
  ]
);

export const salesQuotationDetails = mysqlTable(
  "sales_quotation_details",
  {
    id: int("sales_quotation_detail_id").autoincrement().primaryKey(),
    quotationId: int("quotation_id").notNull(),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    variantId: int("variant_id").references(() => attributeValues.id, { onDelete: "set null" }),
    unitId: int("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    quantity: int("quantity").notNull().default(0),
    rate: decimal("rate", { precision: 14, scale: 5 }).notNull().default("0.00000"),
    discType: mysqlEnum("disc_type", ["percent", "amount"]).notNull().default("percent"),
    discPercent: decimal("disc_percent", { precision: 8, scale: 2 }).notNull().default("0.00"),
    discAmount: decimal("disc_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    lineSubtotal: decimal("line_subtotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
    lineTotal: decimal("line_total", { precision: 14, scale: 2 }).notNull().default("0.00"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    // Explicit short name — Drizzle's auto-generated name for this FK is 69
    // chars, over MySQL's 64-char identifier limit (see the credit-note
    // detail table above for the same issue).
    foreignKey({
      columns: [table.quotationId],
      foreignColumns: [salesQuotations.id],
      name: "fk_sales_quotation_details_quotation",
    }).onDelete("cascade"),
    index("idx_sqd_quotation").on(table.quotationId),
    index("idx_sqd_item").on(table.itemId),
    index("idx_sqd_variant").on(table.variantId),
  ]
);

// Ported from legacy `sales_invoices` / `sales_invoice_details`
// (APP-REPORT.md §7.1 / models/SalesInvoice.php, verified in full). Saving a
// completed invoice deducts inventory (adjust_inventory with a negative
// delta, gated by the same 3-way negative-stock action as everywhere else)
// and always posts the full totalAmount as a Dr entry to the party ledger,
// regardless of isReceived — a same-time receipt additionally posts a
// direct `sales` credit into bankTransactions (NOT through the
// payments/paymentAllocations tables; those are for later/separate
// payments against the invoice's dueAmount). Cancelling restores inventory,
// deletes that bank_transactions row, reverses any delivery challan created
// from this invoice (see deliveryChallans.sourceType/sourceId), and deletes
// any paymentAllocations rows referencing it — the row itself is kept
// (status='cancelled') for the audit trail, not deleted.
export const salesInvoices = mysqlTable(
  "sales_invoices",
  {
    id: int("invoice_id").autoincrement().primaryKey(),
    invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
    invoiceDate: date("invoice_date").notNull(),
    partyId: int("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "restrict" }),
    billingName: varchar("billing_name", { length: 225 }),
    billingAddress: text("billing_address"),
    panNumber: varchar("pan_number", { length: 50 }),
    bankAccountId: int("bank_account_id").references(() => bankAccounts.id, { onDelete: "set null" }),
    warehouseId: int("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }),
    subtotal: decimal("subtotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
    discType: mysqlEnum("disc_type", ["percent", "amount"]).notNull().default("percent"),
    discPercent: decimal("disc_percent", { precision: 8, scale: 2 }).notNull().default("0.00"),
    discAmount: decimal("disc_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    vatPercent: decimal("vat_percent", { precision: 5, scale: 2 }),
    isVatApplicable: tinyint("is_vat_applicable").notNull().default(0),
    vatAmount: decimal("vat_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    totalAmount: decimal("total_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    isReceived: tinyint("is_received").notNull().default(1),
    receivedAmount: decimal("received_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    dueAmount: decimal("due_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    notes: text("notes"),
    status: mysqlEnum("status", ["draft", "completed", "cancelled"]).notNull().default("completed"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_sales_invoice_date").on(table.invoiceDate),
    index("idx_sales_invoice_party_id").on(table.partyId),
    index("idx_sales_invoice_bank_account_id").on(table.bankAccountId),
    index("idx_sales_invoice_status").on(table.status),
    index("idx_si_party_date_status").on(table.partyId, table.invoiceDate, table.status),
  ]
);

export const salesInvoiceDetails = mysqlTable(
  "sales_invoice_details",
  {
    id: int("sales_invoice_detail_id").autoincrement().primaryKey(),
    invoiceId: int("invoice_id")
      .notNull()
      .references(() => salesInvoices.id, { onDelete: "cascade" }),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    variantId: int("variant_id").references(() => attributeValues.id, { onDelete: "set null" }),
    unitId: int("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    quantity: decimal("quantity", { precision: 14, scale: 2 }).notNull().default("0.00"),
    rate: decimal("rate", { precision: 14, scale: 5 }).notNull().default("0.00000"),
    discType: mysqlEnum("disc_type", ["percent", "amount"]).notNull().default("percent"),
    discPercent: decimal("disc_percent", { precision: 8, scale: 2 }).notNull().default("0.00"),
    discAmount: decimal("disc_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    lineSubtotal: decimal("line_subtotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
    lineTotal: decimal("line_total", { precision: 14, scale: 2 }).notNull().default("0.00"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_sales_invoice_details_invoice_id").on(table.invoiceId),
    index("idx_sales_invoice_details_item_id").on(table.itemId),
    index("idx_sales_invoice_details_variant_id").on(table.variantId),
  ]
);

// Ported from legacy `credit_notes` / `credit_note_details` (APP-REPORT.md
// §7.1) — sales returns / price-protection credit notes. Posts a Cr entry
// to the party ledger (we owe them, full totalAmount, regardless of
// isRefunded) and increases inventory for 'sales_return' notes (goods
// physically coming back) — mirrors debitNotes' relationship to purchases.
export const creditNotes = mysqlTable(
  "credit_notes",
  {
    id: int("credit_note_id").autoincrement().primaryKey(),
    creditNoteNumber: varchar("credit_note_number", { length: 50 }).notNull(),
    creditNoteDate: date("credit_note_date").notNull(),
    creditNoteType: mysqlEnum("credit_note_type", ["sales_return", "price_protection"])
      .notNull()
      .default("sales_return"),
    partyId: int("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "restrict" }),
    referenceNo: varchar("reference_no", { length: 100 }),
    billingName: varchar("billing_name", { length: 225 }),
    billingAddress: text("billing_address"),
    warehouseId: int("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }),
    subtotal: decimal("subtotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
    discType: mysqlEnum("disc_type", ["percent", "amount"]).notNull().default("percent"),
    discPercent: decimal("disc_percent", { precision: 8, scale: 2 }).notNull().default("0.00"),
    discAmount: decimal("disc_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    vatPercent: decimal("vat_percent", { precision: 5, scale: 2 }),
    isVatApplicable: tinyint("is_vat_applicable").notNull().default(0),
    vatAmount: decimal("vat_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    totalAmount: decimal("total_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    isRefunded: tinyint("is_refunded").notNull().default(0),
    refundAmount: decimal("refund_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    bankAccountId: int("bank_account_id").references(() => bankAccounts.id, { onDelete: "set null" }),
    notes: text("notes"),
    status: mysqlEnum("status", ["draft", "completed", "cancelled"]).notNull().default("completed"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_cn_date").on(table.creditNoteDate),
    index("idx_cn_party_id").on(table.partyId),
    index("idx_cn_party_date_status").on(table.partyId, table.creditNoteDate, table.status),
    index("idx_cn_type_date").on(table.creditNoteType, table.creditNoteDate),
  ]
);

export const creditNoteDetails = mysqlTable(
  "credit_note_details",
  {
    id: int("credit_note_detail_id").autoincrement().primaryKey(),
    creditNoteId: int("credit_note_id").notNull(),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    variantId: int("variant_id").references(() => attributeValues.id, { onDelete: "set null" }),
    unitId: int("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    quantity: decimal("quantity", { precision: 14, scale: 2 }).notNull().default("0.00"),
    rate: decimal("rate", { precision: 14, scale: 5 }).notNull().default("0.00000"),
    discType: mysqlEnum("disc_type", ["percent", "amount"]).notNull().default("percent"),
    discPercent: decimal("disc_percent", { precision: 8, scale: 2 }).notNull().default("0.00"),
    discAmount: decimal("disc_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    lineSubtotal: decimal("line_subtotal", { precision: 14, scale: 2 }).notNull().default("0.00"),
    lineTotal: decimal("line_total", { precision: 14, scale: 2 }).notNull().default("0.00"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    // Explicit short name — Drizzle's auto-generated
    // "credit_note_details_credit_note_id_credit_notes_credit_note_id_fk"
    // is 65 chars, over MySQL's 64-char identifier limit.
    foreignKey({
      columns: [table.creditNoteId],
      foreignColumns: [creditNotes.id],
      name: "fk_credit_note_details_note",
    }).onDelete("cascade"),
    index("idx_cnd_cn_id").on(table.creditNoteId),
    index("idx_cnd_item").on(table.itemId),
  ]
);

// Ported from legacy `delivery_challans` / `delivery_challan_items`
// (APP-REPORT.md §7.1 / models/DeliveryChallan.php, verified in full). No
// pricing columns at all — a pure dispatch/paper-trail document.
// `sourceType`/`sourceId` (unenforced polymorphic ref to a sales invoice or
// purchase bill) is just a display label ("Invoice #123") — it does NOT
// imply the challan double-deducts stock. Whether THIS challan itself moves
// inventory is controlled independently by the `deductStock` checkbox at
// creation (stored as `stockDeducted`) — e.g. a challan for an invoice that
// already deducted stock itself should leave deductStock off. Cancelling a
// stockDeducted challan restores the quantity and zeroes the flag.
export const deliveryChallans = mysqlTable(
  "delivery_challans",
  {
    id: int("challan_id").autoincrement().primaryKey(),
    challanNumber: varchar("challan_number", { length: 50 }).notNull(),
    challanDate: date("challan_date").notNull(),
    partyId: int("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "restrict" }),
    warehouseId: int("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }),
    sourceType: mysqlEnum("source_type", ["manual", "sale", "purchase"]).notNull().default("manual"),
    sourceId: int("source_id"),
    notes: text("notes"),
    status: mysqlEnum("status", ["pending", "delivered", "cancelled"]).notNull().default("pending"),
    stockDeducted: tinyint("stock_deducted").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_dc_date").on(table.challanDate),
    index("idx_dc_party").on(table.partyId),
    index("idx_dc_status").on(table.status),
    index("idx_dc_party_date_status").on(table.partyId, table.challanDate, table.status),
    index("idx_dc_source").on(table.sourceType, table.sourceId),
  ]
);

export const deliveryChallanItems = mysqlTable(
  "delivery_challan_items",
  {
    id: int("id").autoincrement().primaryKey(),
    challanId: int("challan_id").notNull(),
    itemId: int("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    // Deliberately no FK on variantId/unitId here (unlike every other detail
    // table above) — matches legacy's DeliveryChallans.sql exactly, verified
    // against the report's §7.1 note that this table alone omits them.
    variantId: int("variant_id"),
    unitId: int("unit_id"),
    quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull().default("0.0000"),
    itemNote: varchar("item_note", { length: 255 }),
  },
  (table) => [
    // Explicit short name — Drizzle's auto-generated name for this FK is 65
    // chars, over MySQL's 64-char identifier limit (see the credit-note
    // detail table above for the same issue).
    foreignKey({
      columns: [table.challanId],
      foreignColumns: [deliveryChallans.id],
      name: "fk_delivery_challan_items_challan",
    }).onDelete("cascade"),
    index("idx_dci_challan").on(table.challanId),
    index("idx_dci_item").on(table.itemId),
  ]
);

// Ported from legacy `payments` / `payment_allocations` (APP-REPORT.md
// §7.5 / models/Payment.php). `receiptNumber` auto-generates per
// paymentType (in/out use separate prefixes/sequences). Each payment can
// carry zero or more allocation rows splitting it across specific
// invoices/bills it settles (an unallocated payment is a valid on-account
// receipt) — `documentId` is a deliberately unenforced polymorphic
// reference (sales_invoice | purchase_bill), matching legacy exactly.
export const payments = mysqlTable(
  "payments",
  {
    id: int("payment_id").autoincrement().primaryKey(),
    paymentType: mysqlEnum("payment_type", ["in", "out"]).notNull(),
    paymentDate: date("payment_date").notNull(),
    receiptNumber: varchar("receipt_number", { length: 50 }).notNull(),
    partyId: int("party_id").references(() => parties.id, { onDelete: "set null" }),
    bankAccountId: int("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "restrict" }),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("uq_receipt_number").on(table.receiptNumber),
    index("idx_payment_date").on(table.paymentDate),
    index("idx_payment_type").on(table.paymentType),
    index("idx_payment_party_type_date").on(table.partyId, table.paymentType, table.paymentDate),
    index("idx_payment_bank_date").on(table.bankAccountId, table.paymentDate),
  ]
);

export const paymentAllocations = mysqlTable(
  "payment_allocations",
  {
    id: int("id").autoincrement().primaryKey(),
    paymentId: int("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    documentType: mysqlEnum("document_type", ["sales_invoice", "purchase_bill"]).notNull(),
    documentId: int("document_id").notNull(),
    allocatedAmount: decimal("allocated_amount", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_pa_document").on(table.documentType, table.documentId),
    index("idx_pa_payment").on(table.paymentId),
  ]
);

// Ported from legacy `cheque_register` (APP-REPORT.md §7.5). Tracks
// received/issued cheques through pending -> cleared/bounced/cancelled.
// `reminderDate` is a UI-only reminder (no automated behavior tied to it in
// legacy). `bankName` is a free-text fallback for when the cheque isn't
// tied to one of this app's own bank_accounts rows.
export const chequeRegister = mysqlTable(
  "cheque_register",
  {
    id: int("cheque_id").autoincrement().primaryKey(),
    chequeType: mysqlEnum("cheque_type", ["received", "issued"]).notNull().default("received"),
    chequeNumber: varchar("cheque_number", { length: 80 }).notNull(),
    chequeDate: date("cheque_date").notNull(),
    reminderDate: date("reminder_date").notNull(),
    partyId: int("party_id").references(() => parties.id, { onDelete: "set null" }),
    bankAccountId: int("bank_account_id").references(() => bankAccounts.id, { onDelete: "set null" }),
    bankName: varchar("bank_name", { length: 180 }),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    status: mysqlEnum("status", ["pending", "cleared", "bounced", "cancelled"]).notNull().default("pending"),
    clearedDate: date("cleared_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_cheque_date_status").on(table.chequeDate, table.status),
    index("idx_cheque_reminder_status").on(table.reminderDate, table.status),
    index("idx_cheque_type_date").on(table.chequeType, table.chequeDate),
    index("idx_cheque_party").on(table.partyId),
    index("idx_cheque_bank").on(table.bankAccountId),
  ]
);
