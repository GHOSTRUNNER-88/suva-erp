# Suva ERP — Handoff

Rewritten 2026-08-17, end of a long session that built out the whole Items
module (Items/Categories/Warehouses/Attributes), migrated Units onto the new
shared table component, and did a pass of real UI/UX fixes across Parties +
Items. Read `../AGENTS.md`, `AGENTS.md` (this project), and
`../legacy-erp-kick/APP-REPORT.md` first — this doc assumes that context and
only covers current state + next steps.

**Same day, later session (still 2026-08-17):** wired attribute values into
the Item form (§4) and built the full Cash & Bank / Bank Accounts module
from scratch (§4a) — ported from legacy `bank-accounts.php` +
`models/BankAccount.php`/`BankTransaction.php`.

**Same day, third session:** built a full Inventory module from scratch
(§4b) — item → attribute-value "variant" → warehouse stock tree, manual
stock adjustment, warehouse-to-warehouse stock transfer, and a genuinely new
stock-movement ledger (no legacy equivalent — legacy's own `inventories`
table is a bare current-quantity snapshot with no history at all). Made the
ERP dashboard real (§4c) and fixed a real settings gap (§4d). This session
also used multiple parallel background agents for the first time — see §8
for what that looked like and what to watch out for if you do it again.

**No browser was available while building any of this.** Everything was
verified via `next build`, `eslint`, and `curl` against a real minted
session (see §7) — never by actually clicking through it. Say so if you
pick this up and still can't verify visually.

**New session, 2026-08-17 (continued):** building out the full Sales /
Purchase / Finance transactional core — Purchase Orders, Purchase Bills,
Debit Notes, Expense Categories + Expenses, Sales Orders, Sales Quotations,
Sales Invoices, Credit Notes, Delivery Challans, Payment In/Out, Cheque
Register, Payments Due. **IN PROGRESS as of this note** — schema for all 10
modules is written, migrated, and verified live against all 6 organization
databases (§4e). Shared infra built: `lib/money.js` (VAT/discount
calculator), `lib/document-numbering.js` (the MAX+1 numbering pattern),
`lib/inventory.js` (extracted the inventory-mutation core out of
`items/inventory/actions.js` so it's importable by every new module —
see §4e for why the old private helper couldn't just be exported),
`lib/party-ledger.js` (signed balance recalculation, ported from
`Party.php`'s `recalculate_party_balance`/`party_closing_balance`, verified
in full). Five background agents were dispatched in parallel to build the
actual module UIs/actions on top of that shared foundation (mirroring §8's
lessons from the previous multi-agent run) — if you're reading this and
those agents haven't been integrated yet (i18n keys not merged into
`i18n-resources.js`, `lib/modules.js`'s `built` flags still `false` for
sales/purchase/finance, `setup/actions.js` not wired to seed default expense
categories), that integration pass is the very next thing to do. Full
write-up once that lands.

## 1. What exists right now

- **Signup / Login** — working, Firebase-backed, provisions Company DB +
  Organization DB per signup. Mandatory org setup flow (`/[company]/setup`)
  gates access until a default Organization completes its wizard.
- **Account area** (`/[company]/account/*`) — dashboard, Organizations
  (Firebase-console-style split view), Module Store, account settings.
- **ERP area** (`/[company]/*`) — a real dashboard now (§4c: live KPIs from
  every working module, not placeholders), and five fully-working CRUD
  modules: **Units**, **Parties** (+ Party Groups), **Items** (+ Item
  Categories, Warehouses, Attributes, **Inventory** — stock tree + manual
  adjustment + warehouse transfer + a stock ledger, see §4b), **Cash & Bank**
  (Bank Accounts + their transaction ledger, transfers between accounts —
  see §4a). Sales, Purchase, Finance, Reports, Payroll: nav entries exist,
  gated by module, zero pages built.
- **Nav**: "Switch to ERP" (Account mode sidebar) and "Account Center" (ERP
  mode sidebar) let a user move between the two areas — previously only a
  buried "Account Settings" link in the avatar menu existed for one
  direction.

## 2. The shared patterns every module now follows

These were built once and are meant to be reused, not rebuilt, by whatever
comes next (Sales/Purchase especially).

- **`src/components/ui/data-table.jsx`** — the one table component. Pass
  `columns`, `rows`, `rowActions={(row) => [...]}` (renders a trailing
  actions column), `bulkActions={(ids, {clearSelection}) => [...]}` (renders
  the multi-select toolbar), `filters={[{key, label, options}]}` (searchable
  filter chips, portaled to `document.body` so they float above table
  content instead of being clipped), `emptyIcon`/`emptyMessage`/
  `emptyAction` for the empty state. Virtualized automatically past 30 rows
  (`@tanstack/react-virtual`). Search box built in.
- **`src/components/ui/creatable-select.jsx`** — searchable id/label picker.
  Two ways to create inline: `onCreate(typedName)` (type a non-matching
  name, a "Create '<name>'" row appears — for bare-name entities) and
  `onCreateNew()` (a "+ Add X" row **pinned at the top**, always visible,
  for entities that need a real small form — code+type for a Unit, icon for
  a Category, etc.). Both are `() => Promise<{value, label} | null>` — the
  caller opens its own modal and resolves the promise; see any
  `*-quick-add-form.jsx` file for the pattern.
- **`src/components/ui/icon-picker.jsx`** — searchable icon grid (curated
  ~70 lucide icons, not the full catalog), used for Item Category icons.
  `<CategoryIcon name={iconName} />` renders one elsewhere (falls back to
  `Package` if unset/unrecognized).
- **Quick-add modals**: `parties/party-group-quick-add-form.jsx` (shared by
  the Party form *and* Items' party-group-pricing rows),
  `items/category-quick-add-form.jsx`, and a local `UnitQuickAddForm` inside
  `items-view.jsx`. All follow: local form state → call the real
  create-action → `onCreated({value, label})` → caller resolves the
  `CreatableSelect` promise + `router.refresh()`.
- **`decimalToInputValue()`** in `src/lib/utils.js` — MySQL returns
  `decimal` columns as strings at full defined scale (`"12.00000"`); this
  normalizes for populating an editable `<input>` (`"12.00000"` → `"12"`).
  Use this, not bare `String(...)`, whenever a decimal DB column feeds a
  form field's initial value.
- Every module's file shape: `page.js` (Server Component, fetches +
  redirects if module inaccessible) → `{module}-view.jsx` (client,
  DataTable + Sheet/Modal) → `actions.js` (server actions, zod validation,
  `notAllowed`/`*NotFound` formError keys).

## 3. Items module — full current state

- **Items** (`/items`) — name, category (creatable), primary/secondary unit
  (creatable via quick-add modal), barcode toggle, purchase/selling price,
  **conversion factor** (only shown when secondary unit is set — "1
  primaryUnit = X secondaryUnit", e.g. 1 Box = 12 Pcs — stored as
  `items.conversionFactor`, a narrowed port of legacy's general
  `item_unit_conversions` table since this app only ever has one
  primary+secondary pair), and **party-group pricing** (repeatable rows:
  pick a group via creatable select + a price, sparse — only overrides that
  differ from the standard selling price get a row; synced full-replace on
  every save via `syncItemPartyGroupPrices`).
- **Item Categories** (`/items/categories`) — name, description, icon
  (via IconPicker).
- **Warehouses** (`/items/warehouses`) — name, type (5-option pill grid —
  `SegmentedControl` gained a `wrap` prop for this), phone, address, invoice
  prefix, primary-warehouse toggle (defaults Yes on the very first
  warehouse). Primary badge shows as a `BadgeCheck` icon (title/aria-label
  carries the "Primary Warehouse" text) rather than a text pill.
- **Attributes** (`/items/attributes` + `/items/attributes/[attribute]`) —
  schema + backend + list/detail pages, **and now wired into the Item
  form** (repeatable "pick attribute → pick its values" rows, one row per
  attribute — see §4 for the final shape).

### Schema notes for Attributes (read before touching)

Ported from legacy `attributes`/`product_variants`/`item_variants`
(verified against the actual PHP model, `legacy-erp-kick/models/Item.php`,
not just the schema summary in APP-REPORT.md):

- `attributes` (id, name, slug) — e.g. "Color", "Size". Slug is
  auto-generated server-side (`slugify()` + collision suffix in
  `items/attributes/actions.js`), never a visible form field — legacy's
  admin UI defaults to auto-generating it too.
- `attributeValues` (id, attrId, name, slug) — legacy calls this table
  `product_variants`, which is misleading: it stores **values under an
  attribute** ("Red" under "Color"), not full item variant combinations.
  Renamed here for clarity (logic unchanged).
- `itemAttributeValues` (id, itemId, valueId) — which values apply to an
  item. Ported from legacy's `item_variants`. Legacy's `item_variant_map`
  (item+attr+variant) was **deliberately not ported** — it's fully
  redundant with this table (attrId is always derivable via the value's own
  `attrId`) and nothing in the real `Item.php` functions
  (`sync_item_variants`, `load_item_variants`, `add_item_variant`,
  `clear_item_variants`) ever reads or writes it.
- **Per-variant inventory is now built** (§4b) — `sync_item_inventory_for_variants`
  is ported into `items/actions.js`'s `syncItemInventoryForVariants`, called
  from `createItemAction`/`updateItemAction` right after
  `syncItemAttributeValues`. Still deliberately NOT ported: full
  multi-attribute variant *combinations* as distinct stockable SKUs (legacy
  tracks stock per individual attribute value, not per combination — a
  T-shirt with Size+Color assigned gets one stock bucket per Size value and
  one per Color value, not one per Size×Color pair; this is legacy's own
  quirk, not something to "fix"). Combination-level SKUs only matter once
  Sales/Purchase exist to actually consume them — don't build until asked.

Backend in `items/attributes/actions.js` (now called from both the Item form
— see §4 — and the Inventory tree — see §4b):
- `listAttributesWithValues(companySlug)` → `[{id, name, values: [{id, name}]}]`
  — everything needed to render one checkbox group per attribute.
- `getItemAttributeValueIds(companySlug, itemId)` → `number[]` — which value
  ids are currently assigned to an item (for populating the edit form).
- `setItemAttributeValuesAction(companySlug, itemId, valueIds)` → full-replace
  sync, same pattern as `syncItemPartyGroupPrices`.

## 4. Attribute values on items — done, final shape

Wired up 2026-08-17. User's own framing, verbatim intent: an item like
"iPhone" should let you pick attribute **Color**, then which values under
it apply — Red, Blue, Orange. A "T-shirt" should let you pick **Size**, then
which values apply — L, XL, S, **and** optionally also pick Color — an item
can carry more than one attribute.

The first pass built a flat "one checkbox group per attribute-with-values"
picker per the original plan below, but the user redirected mid-build:
**pick which attribute first, then its values appear** — closer to how
party-group-pricing rows work than a fixed checklist. Final shape, all in
`items-view.jsx`'s `ItemForm` unless noted:

- **Repeatable rows** (`attributeRows` state, same shape/pattern as
  `pricingRows`): each row is `{ key, attrId, valueIds: Set }`. Row UI is a
  `CreatableSelect` to pick the attribute, then — once picked — a pill-toggle
  grid of that attribute's values plus a "+ add value" affordance. Same
  attribute can't be picked in two rows (mirrors `groupOptionsForRow`'s
  dedup for party groups).
- **Both attributes and values are creatable inline**, not just values:
  the row's `CreatableSelect` uses `onCreateNew` (pinned "+ Add Attribute")
  → `AttributeQuickAddForm` (name only, `createAttributeAction`), exactly
  like Category/Unit/Party-Group's onCreateNew pattern. The pill grid's
  "+ add value" button opens `AttributeValueQuickAddForm` (name only,
  scoped to that row's `attrId`, `createAttributeValueAction`). Both update
  a local `attributeGroups` copy of the `attributes` prop optimistically so
  the new option is usable immediately, without waiting on `router.refresh()`.
- **Atomic with the item save** — the open question in the original plan
  was resolved in favor of atomic: `itemSchema` in `items/actions.js` gained
  `attributeValueIds: z.array(z.coerce.number().int().positive()).default([])`,
  and a new `syncItemAttributeValues(db, itemId, valueIds)` helper (same
  full-replace pattern as `syncItemPartyGroupPrices`) is called directly
  inside `createItemAction`/`updateItemAction`. `ItemForm` flattens
  `attributeRows` into one array (`row.valueIds` per row) and submits it as
  part of the normal item payload — no second round-trip.
  `setItemAttributeValuesAction` (attributes/actions.js) is left in place
  as a standalone action for any future caller that needs to sync values
  without a full item save, but the Item form itself no longer calls it —
  it uses `getItemAttributeValueIds` only, to populate rows on edit
  (flat value-id list regrouped into rows client-side via each value's
  `attrId` membership in `attributeGroups`).
- **Items list row** — `listItems` (`items/actions.js`) now runs a second
  query joining `itemAttributeValues`/`attributeValues` for the returned
  item ids and attaches `attributeValueNames: string[]` per row (in-memory
  merge, not a join on the main query, so the one-to-many values don't
  multiply the base rows). Rendered in `items-view.jsx`'s "name" column as
  ` • Red, L` appended to the existing category subtitle line — kept to the
  same single truncating line so the table's fixed 44px row height
  (`data-table.jsx`) isn't disturbed.
- i18n: no new keys needed — `assignAttributeValues`/`assignAttributeValuesHint`
  (added previous session) cover the section heading/hint;
  `addAttribute`/`attributeName` and `addAttributeValue`/`attributeValueName`
  (already existed for the Attributes admin pages) cover both quick-add forms.
- Verified via `next build` + `eslint` + a `curl` integration route (see
  §7) that exercised create → multi-attribute assign → edit-load regroup →
  update/full-replace → list-row `attributeValueNames`, end to end against
  real `kick-lifestyle1` data. No browser, so the actual pill/row rendering
  itself hasn't been eyeballed — say so if you pick this up and still can't
  verify visually.

<details>
<summary>Original plan (superseded by the row-based shape above, kept for history)</summary>

1. In `items/page.js`, fetch `listAttributesWithValues(company)` alongside
   the existing `categories`/`units`/`partyGroups` and pass it into
   `ItemsView` as a new prop (`attributes`) — this part didn't change.
2. ~~Add a section that renders one group per attribute — attribute name as
   a sub-heading, then a checkbox per value under it. Only render attributes
   that actually have values.~~ Superseded — see "pick attribute first"
   above.
3. On edit, fetch `getItemAttributeValueIds` — kept, but the flat id list is
   now regrouped into per-attribute rows instead of a single selected-ids set.
4. ~~Call `setItemAttributeValuesAction` after the item save~~ — resolved
   atomic instead, see above.
5. Inline creation — kept, but both attributes AND values ended up
   creatable inline (not just values), see above.
6. List row pills — done as described above.
7. i18n — confirmed no new keys needed.

</details>

## 4a. Cash & Bank module — built from scratch, full current state

Ported from legacy `admin/bank-accounts.php` + `models/BankAccount.php` +
`models/BankTransaction.php` (APP-REPORT.md §7.5). Routes:
`bank-accounts/page.js` (list) → `bank-accounts/bank-accounts-view.jsx`
(client: DataTable + create/edit Sheet + Transfer modal) and
`bank-accounts/[account]/page.js` (ledger detail, same
list-page-drills-into-detail-route shape as `parties/[party]/page.js`) →
`bank-accounts/bank-account-ledger-view.jsx`. Backend in
`bank-accounts/actions.js`. `lib/modules.js`'s `cashBank` entry flipped to
`built: true`.

- **Schema** (`db/schema/organization.js`): `bankAccounts` + `bankTransactions`,
  both copied field-for-field from legacy's SQL (same column names/types/
  indexes, `bankTransactions.transactionRefId` deliberately has no FK —
  same unenforced-polymorphic-ref pattern flagged elsewhere in `../AGENTS.md`
  §6). The `transaction_type` enum carries all 11 legacy values (sales,
  purchase, payment_in, payment_out, expense, opening_balance, transfer,
  credit_note, debit_note, manual, vat_payment) even though **this app only
  ever writes `opening_balance` and `transfer` rows today** — the rest exist
  so Sales/Purchase/Finance/Payroll/Maskebari can post into this same ledger
  later without a schema change, exactly mirroring what legacy's own
  bank-accounts.php does (it has no manual-transaction-entry form either;
  every other transaction_type is written by *other* legacy pages that
  haven't been ported yet).
- **Balance is genuinely ledger-only, computed live** — no cached column.
  `getBankAccountBalance(db, id, asOfDate?)` in `bank-accounts/actions.js`
  is `Σcredit − Σdebit` via a SQL `SUM(CASE...)`, exported so
  Sales/Purchase/dashboard/balance-sheet can reuse the exact same formula
  later (`../AGENTS.md` §6's explicit rule). The list page's
  `listBankAccountsWithBalance` computes the same formula batched via
  `LEFT JOIN ... GROUP BY` instead of one query per account — same formula,
  just batched for the list's sake, not a second competing implementation.
  `getBankAccountBalanceBefore(db, id, date)` is the strictly-before variant
  (mirrors legacy's separate `get_balance_before_date()`), used for the
  ledger page's "Opening Balance (before <filter start>)" line once a date
  filter is applied.
- **Opening balance is a ledger row, not a separate field read at display
  time** — `bankAccounts.openingBalance` is just what the form shows/edits;
  `syncOpeningBalanceTransaction()` keeps a single `opening_balance`
  transaction row in sync with it on every create/update (create if
  amount>0 and none exists, update in place if one exists, delete it if the
  amount is reset to 0) — verified via the curl integration test that this
  never duplicates the row across repeated updates.
- **Transfer between accounts** creates two cross-referenced rows (a debit
  on the source account, a credit on the destination, each other's id in
  `transactionRefId`) with mirrored note text (`"Transfer to: X — note"` /
  `"Transfer from: Y — note"`). **Editing** a transfer (`updateTransferAction`)
  resolves both linked rows from either leg's id and updates amount/date/
  note on both symmetrically — the Edit Transfer form (opened from a
  transfer row's action in the ledger table) parses the counterparty name
  and custom note back out of the stored note text client-side
  (`parseTransferNote` in `bank-account-ledger-view.jsx`) rather than
  fetching it from the server, since the row is already loaded.
- **QR code upload uses this server's own filesystem, not Firebase
  Storage** — explicit user instruction, and it also sidesteps the
  still-not-provisioned Storage bucket (§5). `uploadBankQrCodeAction` writes
  to `public/uploads/qr-codes/<organizationId>/<file>` (mirrors legacy's own
  `/uploads/qr/` convention) and returns that as the URL, same client-upload-
  then-store-the-URL flow as `LogoUploadField`/`uploadOrganizationLogoAction`
  (organizations/actions.js) otherwise. `public/uploads/` is gitignored. The
  QR file is deleted from disk when its bank account is deleted
  (`deleteBankAccountsAction`), **and also when it's replaced by a new
  upload on an existing account** (`updateBankAccountAction` — a code-review
  pass caught that this wasn't handled at first, since
  `uploadBankQrCodeAction` always writes a fresh filename rather than
  overwriting in place, so every replacement was leaking one file forever;
  fixed and verified via a live integration test). This is one gap ahead of
  the org logo path (`organizations/actions.js`), which still doesn't clean
  up a replaced logo — that one's still open, not fixed this session.
- **Dual-calendar**: `asOfDate` (bank account), `transferDate` (transfer +
  edit-transfer), and the ledger's from/to transaction filter all use the
  shared `DualDateField` — this is the first real usage beyond the org
  wizard (see §5's old note, now partly stale).
- **Not built, matching legacy's own scope for this specific page**: manual
  transaction entry (legacy's bank-accounts.php doesn't have this either —
  only opening-balance and transfer write to the ledger from this page), a
  bank-statement export/report (legacy has this as its own separate
  `reports-engine` view, not part of bank-accounts.php).
- Verified via `next build` + `eslint` + a `curl` integration route (see
  §7) that exercised: create two accounts → balances correct → transfer →
  both ledgers correct → edit transfer → both legs updated symmetrically →
  opening-balance bump (updates in place) → opening-balance zeroed (deletes
  the row) → QR upload writes a real file under `public/uploads/` and is
  attached to an account → bulk delete cascades transactions and removes
  the QR file. No browser, so say so if you pick this up and still can't
  verify visually.

## 4b. Inventory module — built from scratch, full current state

User's own framing, verbatim intent: an item like "IPHONE" should show a
total (15pcs), broken into its variants (Red 8pcs, Blue 7pcs), each further
split by warehouse — "with warehouse, with variant wise". Then, mid-build,
three more asks landed in the same page: search, a category filter, skip
the expand/collapse for items with no variants (show their warehouse split
directly, no click needed), export + print, and a stock ledger — all on the
same page, not separate routes. Routes: `items/inventory/page.js` →
`items/inventory/inventory-view.jsx` (client — the whole tree, filters,
export/print, three modals) → `items/inventory/actions.js` (backend).

- **Data model — flat per-variant, not per-combination** — confirmed against
  the real legacy PHP (`models/Item.php`'s `sync_item_inventory_for_variants`,
  lines 451-491): an item with Color(Red,Blue) *and* Size(S,M) assigned gets
  **4** inventory rows per warehouse (Red, Blue, S, M), never a Red×S/Red×M/
  Blue×S/Blue×M cross-product. `items/actions.js`'s new
  `syncItemInventoryForVariants(db, itemId, primaryUnitId, valueIds)` ports
  this exactly: only ever INSERTs a missing `(variant, warehouse)` row at
  qty 0 (never overwrites a row that already exists, so re-syncing after an
  attribute-value change can never silently reset real stock), drops the
  orphaned `variantId=0` "no variant" placeholder once real variant rows
  exist (but only if that placeholder is still qty 0), and does **not**
  delete a variant's inventory row just because the attribute value was
  unassigned from the item later — that stock stays in the database,
  orphaned, exactly like legacy. Called from `createItemAction`/
  `updateItemAction` right after `syncItemAttributeValues`.
- **`listInventoryTree(companySlug, {warehouseId?})`** — fetches items +
  inventory rows as two flat queries, assembles the item → variant →
  warehouse tree in JS (not a 3-level SQL join). Always includes every item,
  even ones with zero inventory rows yet. Filters out the `variantId=0`
  placeholder for any item that has real variants, mirroring legacy's
  `get_all_inventory()` filter.
- **Manual stock adjustment** (`adjustInventoryAction`, three modes)
  and **warehouse-to-warehouse stock transfer** (`transferStockAction`, new
  feature, no legacy equivalent — confirmed via grep, nothing under
  `admin/*.php`/`models/*.php` resembles it) both share two helpers:
  `getInventoryRow` (read) and `writeInventoryDelta` (upsert + ledger write,
  see below). Mode semantics ported exactly from `admin/inventory.php`'s
  form handler: `'set'` overwrites outright with **no** negative-stock check
  at all (matches `set_inventory()` having none); `'add'`/`'remove'` are
  deltas (matches `adjust_inventory()`) — only `'remove'` (and a transfer's
  source leg) can ever go negative, gated by `settings.negativeStockAction`
  (0 = allow silently, 1 = allow + warning, 2 = block with a `formError`).
  This setting is now genuinely editable, not just read — see §4d.
- **Stock ledger — new table, no legacy equivalent.** Legacy's own
  `inventories` is a pure current-quantity snapshot; `set_inventory`/
  `adjust_inventory` only ever write the running quantity, nothing records
  *why* it changed. Added `inventoryTransactions` (`db/schema/organization.js`)
  — `itemId, variantId, warehouseId, changeType ('set'|'add'|'remove'|
  'transfer_in'|'transfer_out'), quantityChange (signed decimal), quantityAfter
  (snapshot at write time, not replayed), note, createdAt`. `writeInventoryDelta`
  is the *only* writer — every `inventories.quantity` change is always paired
  with a ledger row, no separate call needed anywhere. `getStockLedger(companySlug,
  {itemId, variantId, warehouseId})` reads it back newest-first for the
  per-cell "View Ledger" modal.
  **`itemId`/`warehouseId` FKs are `restrict`, not `cascade`** — deliberately:
  a code-review pass caught that cascading would let deleting an item
  silently erase its entire stock-movement history, which defeats the point
  of an audit log. Practical effect: `deleteItemsAction`/`deleteWarehousesAction`
  now fail with a raw FK error if the item/warehouse has any logged stock
  movement — a blocked delete beats a silently vanished audit trail, but
  neither action currently catches this into a friendly `formError` message;
  that's a reasonable follow-up, not done yet.
- **UI, all in `inventory-view.jsx`**: collapsible item rows (`ExpandableItemRow`)
  for items with variants (collapsed by default, chevron); items with *no*
  variants render flat (`FlatItemRow`, no chevron, warehouse split always
  visible — this was an explicit user correction mid-build, "we don't need
  accordion" for those). A text search (item name, client-side) and a
  category filter (`CreatableSelect` off the `categories` prop, client-side)
  sit next to the existing server-side warehouse filter (`?warehouse=` query
  param — that one has to be server-side since it changes which rows get
  aggregated into totals, not just which rows are visible). Export Excel
  (`exportInventoryToExcel`, new function in `lib/export-excel.js`, same
  per-table-dedicated-function convention as `exportPartyLedgerToExcel`) and
  Print (`window.print()` + a `hidden print:block` flattened table, copied
  from `party-ledger-view.jsx`'s black-on-white print pattern) both operate
  on the *currently filtered* tree (search + category + warehouse all
  applied), not the raw unfiltered one. Adjust/Transfer/View-Ledger are all
  launched from the specific warehouse row they apply to (pre-filled item/
  variant/warehouse) rather than a generic modal with cascading pickers like
  legacy's `admin/inventory.php` — the tree itself already is the picker.
- **Dashboard low-stock alerts** (§4c) use a hardcoded `LOW_STOCK_THRESHOLD = 5`
  — there's no reorder-level field on items yet, this is a placeholder
  judgment call, not a real configured threshold.
- Verified two ways: (1) a full curl integration test exercising
  create → multi-attribute assign → adjust (set/add/remove) → transfer →
  every `getStockLedger` assertion (24 total, all passed) → cascade-delete
  confirmed real via direct SQL; (2) a second integration test specifically
  for the FK-restrict fix and the QR-file-cleanup-on-replace fix (§4a), both
  confirmed working, though that test's own cleanup code had a bug (deleted
  its own warehouse before deleting the item that referenced it via
  `inventories`, tripping an unrelated pre-existing `restrict` FK on
  `inventories.unitId` — not a production bug, just sloppy test-script
  ordering; cleaned up by hand, not fixed in the throwaway script). No
  browser, so the actual nested-tree/pill/modal rendering hasn't been
  eyeballed — say so if you pick this up and still can't verify visually.

## 4c. ERP dashboard — real KPIs + animations, was previously a placeholder

`dashboard/page.js` (Server Component, fetches from every working module,
gated by `context.accessibleModules` so a disabled module just omits its
card instead of failing the page) → new `dashboard-view.jsx` (client,
replaces the old `dashboard-home.jsx`). Real data: Cash & Bank total (via
`listBankAccountsWithBalance`), Parties receivables/payables (from the
signed `balance` field), Items/Warehouses/Units counts, and a low-stock
alert list (`listInventoryTree` flattened, threshold noted above). KPI cards
stagger in and numbers count up via a new small reusable
`src/components/ui/animated-number.jsx` (`framer-motion`, same restrained
timing as `sheet.jsx`/`modal.jsx` — this is a daily-use accounting tool per
`AGENTS.md` §8, not a marketing site, so animation is subtle by design, not
decorative).

## 4d. Settings — negativeStockAction was a hardcoded display, now real

`account/organizations/[organization]/settings/page.js` was showing a
static `t("warnBeforeSave")` string for "Negative Stock Action" — a
leftover placeholder from before Inventory (§4b) existed and actually
branched on this setting. Now wired for real: `getOrganizationSettings()`/
`updateNegativeStockActionAction()` (new, `account/organizations/actions.js`)
read/write `settings.negativeStockAction` in the org DB, and a new
`inventory-settings-card.jsx` renders it with a `SegmentedControl` (Allow /
Allow with warning / Block) matching the edit-in-place pattern used
elsewhere in that settings page.

## 4e. Sales / Purchase / Finance transactional core — schema + shared libs done, modules being built

Ten new tables' worth of Drizzle schema landed in one shot in
`db/schema/organization.js` (migration `0009_tiny_puff_adder.sql`, migrated
live against all 6 `suva_org_*` databases): `expenseCategories`, `expenses`,
`purchaseOrders`/`purchaseOrderDetails`, `purchaseBills`/
`purchaseBillDetails`, `debitNotes`/`debitNoteDetails`, `salesOrders`/
`salesOrderDetails`, `salesQuotations`/`salesQuotationDetails`,
`salesInvoices`/`salesInvoiceDetails`, `creditNotes`/`creditNoteDetails`,
`deliveryChallans`/`deliveryChallanItems`, `payments`/`paymentAllocations`,
`chequeRegister`. Every table is a field-for-field port of
`APP-REPORT.md` §7.1/§7.2/§7.5/§7.6, cross-checked against the actual PHP
model files (not just the schema doc) for the parts that only show up in
code — see the block comment above `expenseCategories` in
`organization.js` for the full list of shared conventions (FK onDelete
choices, decimal precision, the deliberate quantity-column-type
inconsistency carried over from legacy).

**A real gotcha hit during migration, worth knowing if you touch this
schema again**: 3 of Drizzle's auto-generated FK constraint names exceeded
MySQL's 64-char identifier limit (`credit_note_details_credit_note_id_
credit_notes_credit_note_id_fk` and two others) — the migration failed
*mid-file* on one organization DB (MySQL DDL isn't transactional, so the 20
`CREATE TABLE`s before that point had already committed). Fixed by giving
those three FKs explicit short names via Drizzle's `foreignKey()` table
builder instead of the inline `.references()` shorthand (see
`organization.js`'s `creditNoteDetails`/`deliveryChallanItems`/
`salesQuotationDetails` tables for the pattern), then manually dropping the
20 partially-created tables in the one affected DB
(`suva_org_kick_lifestyle_cca9315f`) and regenerating clean. If you add
another long table+column name pair, check the generated migration's
`CONSTRAINT` names before applying — `grep -o 'CONSTRAINT `[^`]*`' <file> |
awk '{print length, $0}' | sort -rn | head`.

**Unrelated but blocking, also hit and fixed this session**: local MariaDB
wouldn't start — `mysql.db` (the Aria-engine system privileges table) was
marked crashed from a prior unclean shutdown, and `multi-master.info` (the
replication bookkeeping index, unused — this is a standalone non-replicating
dev server) had pre-existing corrupted content that made every start
attempt spawn more garbled relay-log files. Fixed via `aria_chk -r` on
`mysql/data/mysql/db` and resetting `multi-master.info` to `0`. Neither of
these touched actual schema/table data — just infra housekeeping, unrelated
to anything in this app's own code, but you'll hit the same wall if MySQL
won't start and the error log mentions `crashed` or `multi master
structures`.

**Shared libraries** (all plain modules, deliberately NOT `"use server"` —
see each file's own top comment for why: a `"use server"` file's every
export becomes an unauthenticated client-callable RPC endpoint, wrong for
functions that take a raw `partyId`/`itemId` with no permission check of
their own):
- `lib/money.js` — `round2`, `calcLineTotal`, `calcDocumentTotals`. Ports
  the universal VAT/discount formula from `../AGENTS.md` §6 exactly
  (`afterDiscount = subtotal − headerDiscount`, `vat = afterDiscount ×
  vatPercent/100`, `total = afterDiscount + vat`), rounding to 2 decimals at
  every stage so a stored total always matches hand-recomputing it from the
  stored lines.
- `lib/document-numbering.js` — `nextWarehouseScopedNumber` (invoice/bill/
  credit-note/debit-note/challan's `MAX(id)+1` + per-warehouse prefix
  override pattern) and `nextFixedPrefixNumber` (order/quotation/expense's
  simpler fixed-prefix version). Ported from `get_next_invoice_number()` and
  its siblings across `models/*.php` — all verified to follow the exact same
  shape.
- `lib/inventory.js` — `applyInventoryChange` is the one entry point every
  Sales/Purchase module should call for a stock effect (wraps the negative-
  stock 3-way gate + the audit-trail write). This is the old private
  `writeInventoryDelta`/`getInventoryRow`/`getNegativeStockAction` trio from
  `items/inventory/actions.js`, extracted out to a plain module so it's
  safely importable elsewhere — `items/inventory/actions.js` now imports
  from here instead of defining its own copies.
- `lib/party-ledger.js` — `recalculatePartyBalance(db, partyId)`, ported
  from `Party.php`'s `recalculate_party_balance()`/`party_closing_balance()`
  (verified in full). Always a full recompute from the opening balance plus
  every ledger-relevant document, never a delta nudge. Preserves a verified
  legacy quirk on purpose: `salesInvoices`/`purchaseBills`/`expenses`
  exclude cancelled rows from the sum, but `creditNotes`/`debitNotes` do
  NOT filter by status at all (legacy's own `get_party_ledger()` query has
  no status condition on those two) — don't "fix" this if you notice it.

**Module build**: five background agents were dispatched in parallel, each
owning a disjoint set of route folders (no shared-file edits — i18n keys
were collected to scratch JSON files instead of each agent editing
`i18n-resources.js` directly, learning from §8's collision lesson):
Purchase (orders/bills/debit-notes), Expense (categories/expenses, plus a
`seedDefaultExpenseCategories` export not yet wired into
`setup/actions.js`), Sales-workflow (orders/quotations/delivery-challans),
Sales-money (invoices/credit-notes), Finance (payment-in/out/cheque-
register/payments-due — the one cluster whose legacy behavior wasn't fully
pre-verified before dispatch, so that agent was told to read
`Payment.php`/`Cheque.php` itself first). **If you're reading this before
the integration pass happened**: check whether `i18n-resources.js` has
sales/purchase/finance keys yet, whether `lib/modules.js`'s `built` flags
are still `false` for those three modules, and whether
`setup/actions.js` calls `seedDefaultExpenseCategories` — if not, that
integration is the next task, not a fresh build.

## 5. Known gaps / explicitly flagged, not yet done

- **PAN lookup via IRD**: user asked for it, provided a reference scraping
  script. It's dead — verified live against IRD's actual site this session:
  the script's CSRF field/endpoint no longer exist, and the current form
  has a real Google reCAPTCHA (`/api/getPanSearch/` returns a hard 400
  `{"error": "Invalid Captcha Value."}` without a real token). A
  new-tab-to-IRD's-own-page version was built, then **explicitly reverted
  at the user's request** ("remove it, leave this idea"). Don't rebuild
  this without being asked again — if asked, the new-tab approach is the
  only compliant option; don't attempt to embed/proxy IRD's captcha.
- **Firebase Storage bucket** (`suva-erp.firebasestorage.app`) still doesn't
  exist — org logo upload code is correct and ready, fails with a 404 from
  Google until someone enables Cloud Storage for the Firebase project in
  the console. Not fixable from code. Confirmed non-fatal (signup/setup
  still completes fine, upload just silently fails). Bank QR code upload
  (§4a) deliberately does **not** share this problem — it was built against
  this server's own filesystem instead, per explicit user instruction, so
  it works today regardless of the Firebase bucket's status.
- **Fiscal-year-as-sub-organization** — user wants Organization → multiple
  Fiscal Year instances (legacy's Company-rollover concept). Real
  architecture decision (new DB tier? logical partition?), explicitly
  deferred, not started, needs its own design pass.
- **Party ledger** only ever shows the opening-balance line — real
  transaction entries need Sales/Purchase/Payments to exist first. (Cash &
  Bank's ledger, by contrast, now has real ongoing rows — opening balance +
  transfers — since that module owns its own transaction table; see §4a.)
- Dual-calendar coverage (`../AGENTS.md` §4) was only the one field from
  earlier sessions (`DualDateField` in the org wizard) — Cash & Bank (§4a)
  is the first module beyond that to actually use it (asOfDate, transfer
  dates, ledger date filter). Still not used anywhere else yet (Items,
  Parties, Units have no date fields at all today).
- No legacy-data migration script — gated by `../AGENTS.md` §6, don't start
  without being asked again.
- **Org logo replacement leaks the old file** — `organizations/actions.js`'s
  `uploadOrganizationLogoAction` always writes a fresh filename (never
  overwrites), and nothing deletes the old one when a new logo is uploaded
  over an existing one. Same bug class just fixed for bank account QR codes
  (§4a), noticed while fixing that one, not fixed here — narrower blast
  radius (Firebase Storage, not this server's own disk) so lower priority,
  but a real leak if anyone actually changes their org logo more than once.
- **Money/quantity fields with `min(0)`-style zod validation but no rendered
  `fieldErrors` message** were a real, recurring bug pattern found this
  session (bank account opening balance, item purchase/selling price + the
  party-group-price override, party opening balance — all fixed). The
  pattern: typing a negative number has no HTML-level guard, the server
  correctly rejects it, but the form never displayed *why* — Save just
  silently stopped working. Worth a quick grep (`\.min\(0\)` in any
  `actions.js` without a paired `fieldErrors.<field>` render in its view)
  next time you're in a module that wasn't covered by this session's pass —
  `warehouseSchema.invoicePrefix` (validates before its own normalization
  strips symbols, so a valid-after-normalizing value can get wrongly
  rejected) and a few `.max(N)` string-length fields
  (`itemCategorySchema.description`, `warehouseSchema.storeAddress`,
  `bankAccountSchema.displayName`, `itemSchema.barcodeValue`) have the same
  silent-failure shape but were left alone this session — narrower/rarer
  triggers than the money fields, not confirmed as worth fixing yet.

## 6. A note on something that happened mid-session

Partway through this session, `items/warehouses/warehouses-view.jsx` got
hit by a rapid sequence of odd, broken edits (bad imports, garbled syntax,
real UI text silently replaced) that looked like external tampering and
were flagged as such in the moment — including a live recommendation to the
user to go investigate what had write access to the file. **It turned out
to be the user making that exact edit themselves through their own IDE at
the same time** (swap the "Primary Warehouse" text badge for a `BadgeCheck`
icon), which was then correctly implemented once that became clear. Documenting
this so it doesn't get mistaken for a real incident if referenced later —
it wasn't one, just genuinely confusing concurrent editing. No action
needed, nothing was actually compromised.

## 7. Environment / running it locally

- MySQL is XAMPP's MariaDB (`C:\xampp`), root/no-password. Client:
  `"/c/xampp/mysql/bin/mysql.exe" -u root -h 127.0.0.1 -P 3306`.
- Real test data in the master DB — companies include `kick-lifestyle`,
  `kick-lifestyle1` (id 4, org db `suva_org_kick_lifestyle1_8343740f`, has a
  working owner user id 1 + default org id 1 with `items`/`parties`/etc.
  enabled), `kick-lifestyle2`, `kick`, `suvacorp` (newly created this
  session via Google signup, has zero data — good for testing empty
  states). Don't assume a clean database.
- **No browser available.** Verification pattern used throughout: `npm run
  build` (catches real compile errors dev mode sometimes swallows) + a
  temporary `src/app/api/tmp-mint-session/route.js` Route Handler calling
  `createSession({...})` with real IDs from the above, curl with a cookie
  jar against it, then **always delete the temp route afterward**. If you're
  running more than one verification at once (yourself + a background
  agent, or multiple agents), give each its own uniquely-named temp route
  instead of sharing `tmp-mint-session` — see §8, this bit everyone this
  session.
- After any schema change: edit `src/db/schema/organization.js` →
  `npm run db:generate:organization` → inspect the generated SQL in
  `drizzle/organization/` before applying → `npm run db:migrate:organizations`
  (applies to every existing org DB, loops all companies → all orgs).
- Dev server (`npm run dev`, port 3000, Turbopack) goes stale after big
  edit batches or mid-session `npm install`s — kill it
  (`Stop-Process -Force` on the PID from `netstat -ano | grep :3000`), and
  prefer restarting via a real `npm run build` first so build errors surface
  before you trust dev mode again. **But that symptom isn't always the dev
  server** — the classic tell (instant HTTP 500, completely empty body,
  real page routes still return 200 fine) usually does mean staleness, but
  it can also mean a genuine unhandled exception in *your own* temp
  verification route crashed before reaching your `try/catch` (e.g. an
  error thrown inside a `finally` block). Check the dev server's own stdout
  for a real Node stack trace before concluding it's staleness and
  restarting — if you started the dev server via a backgrounded Bash
  command, the task output file has it (`TaskOutput` tool, or the file path
  from the `run_in_background` result). This session burned real time on
  exactly this confusion (see §8).
- `i18n-resources.js` is the single bilingual dictionary. Check EN/NE key
  count parity and zero duplicates after every edit — there's a node
  one-liner used throughout this session for that (search recent
  conversation/transcripts for `dupCheck` if you need it again, or just
  write a fresh one: regex-match `^\s*key:` inside the `en.translation`/
  `ne.translation` blocks, compare counts and set differences).

## 8. Using multiple background agents at once — first time this session, worth knowing

The user asked for real parallelism partway through this session: 6
background agents running concurrently at one point (2 building/verifying
Inventory, then 4 more — dashboard, a read-only code-review pass, settings,
and a bug-fix pass — dispatched together once the first 2 finished). It
worked, and it's a legitimate way to move faster on genuinely independent
work — but three things bit us, worth knowing before doing it again:

- **Give every agent an explicit, non-overlapping file/directory scope in
  its prompt, and repeat the boundary for the *other* agents running at the
  same time** (e.g. "don't touch `items/inventory/`, another agent is
  actively editing it"). One agent still noticed and correctly worked
  around a collision on its own (`account/organizations/actions.js` while
  a shared temp route was mid-use) — but that was luck/good agent judgment,
  not something the scoping guaranteed. Read-only review agents are the
  safe exception — no file-write collision is possible, so that's a good
  role to hand out generously.
- **Temp verification routes collide if agents share the conventional path
  name.** Multiple agents (and me) independently used
  `src/app/api/tmp-mint-session/route.js` for session-minting, per the
  established pattern in this doc — but each agent deletes it as part of
  its own cleanup, so a concurrently-running agent (or you) can lose the
  file mid-use, or a stray older curl request can silently recreate/collide
  with it. Give each concurrent verification route a unique name
  (`tmp-mint-session-<purpose>`) when more than one agent/you are verifying
  at the same time — don't rely on the shared conventional name.
- **A killed dev server can abort an in-flight request mid-`finally`,
  leaving cleanup half-done.** Restarting the dev server (§7) while a
  background agent might still have a request in flight against it left
  several rounds of orphaned `Tmp*`-prefixed test rows (items, warehouses,
  units, one bank account + its QR file) that took real time to untangle
  afterward, compounded by test scripts whose own cleanup order didn't
  account for cross-run leftover state (see §4b's FK-restrict verification
  note). Prefer restarting the dev server only once you're confident no
  agent is still relying on it — and when writing a temp verification
  route's cleanup code, don't assume you're starting from a clean slate;
  either use fully unique per-run names (a `Date.now()` suffix, as most of
  this session's temp routes did) or defensively query-and-clean anything
  matching your naming convention at the *start* of the route, not just
  rely on your own `finally` block succeeding.
