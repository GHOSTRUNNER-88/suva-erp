@../AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# suva-erp (Next.js) — Project Rules

Workspace-wide rules that also apply here (API ownership, bilingual/dual
calendar, accounting accuracy, legacy PHP handling, UI parity with mobile):
see `../AGENTS.md`. This app **is** the API source of truth referenced there
— `suva-erp-mobile` calls into this app, this app owns the business logic.

## UI

- Use shadcn/ui for all components. Don't hand-roll a component (button,
  dialog, table, form field, etc.) that shadcn already provides.
- Before building a new page, open 2-3 existing pages first and match their
  layout, spacing, and component patterns. Consistency across pages beats a
  locally "nicer" one-off design.
- Keep it clean: clear hierarchy, generous whitespace, no unnecessary chrome.
- Every new screen needs both English and Nepali copy, and both BS and AD
  dates wherever a date appears (see `../AGENTS.md` §3–4).

## API

- This app's API routes are the only backend `suva-erp-mobile` is allowed to
  call. When adding a feature that mobile will also need, design the API
  route with that in mind (don't build something desktop-only that later
  needs a rewrite for mobile).
- Money/accounting fields: use decimal-safe arithmetic and one consistent
  rounding rule everywhere — see `../AGENTS.md` §5.

## Legacy system: ERP Kick / Suvacorp

The system being ported is **ERP Kick** (branded "Suvacorp" in its UI) — a
PHP + MySQL/MariaDB ERP with no framework/ORM. Full technical and functional
reference (schema, every screen's field-by-field behavior, model function
inventory): `../legacy-erp-kick/APP-REPORT.md`. **Read the relevant section
before touching any module** — sales, purchase, inventory, parties, finance,
payroll, or VAT/Maskebari reporting all have exact behavior documented there
that must be matched (see `../AGENTS.md` §6: logic ports same-to-same, UI/UX
does not).

The PHP project source and the `db/` folder (full SQL) have not been
provided yet — don't guess at anything not in the report above until they
arrive.

**Business rules that must be preserved exactly** (the ones that would
silently produce wrong numbers or break a workflow if missed):

- **VAT/discount formula**, identical across sales invoice, purchase bill,
  credit note, and debit note:
  `afterDiscount = subtotal − headerDiscountAmount`
  `vatAmount = afterDiscount × vatPercent / 100` (only if VAT is applicable)
  `total = afterDiscount + vatAmount`
  Every discount (header and per-line) is a `{value, type}` pair, `type` ∈
  `percent | amount`.
- **Never trust client-submitted totals** — line items and header amounts are
  always re-walked and recomputed server-side before insert, even when the
  client already posted computed hidden totals. Keep this pattern in
  `suva-erp`, not just as a port of old behavior but as the design going
  forward (see `../AGENTS.md` §5).
- **Party ledger balance is signed**: positive = Dr (they owe us), negative =
  Cr (we owe them). It's a cached/denormalized value recalculated by one
  central routine — don't accumulate it ad hoc in multiple places.
- **Expense VAT is force-disabled server-side** when the expense category is
  "Salary" (case-insensitive) or `taxable_amount <= 0`, regardless of what
  the client posts.
- **Payroll has no dedicated ledger** — each staff payment posts as an
  Expense in the "Salary" category. Preserve this unless explicitly asked to
  build a real payroll-run/payslip module.
- **Document numbering differs by document type** — don't unify these into
  one generic scheme: invoice/bill/credit-note/debit-note/challan
  auto-generate `PREFIX-0000` per warehouse; purchase bills allow manual
  override (for the supplier's real VAT bill number); expense numbers are
  always user-editable; order/quotation numbers are free text with a
  uniqueness check instead of auto-generation.
- **Line quantities are always whole numbers in practice** — despite several
  detail tables (invoice/bill/credit-note/debit-note) declaring
  `quantity DECIMAL(14,2)`, every create/update path in the actual PHP code
  rounds to an integer (`(int)round($qty)`) before saving. Fractional
  quantities are never actually persisted; don't assume decimal support just
  because a column type allows it — verify against the model file, not the
  schema alone.
- **Negative stock is a configurable three-way behavior**
  (`settings.negative_stock_action`): `0` = allow silently, `1` = allow but
  warn, `2` = block the transaction with a hard error. Preserve all three
  modes, not a single stock-check rule.
- **VAT is backed out of a tax-inclusive total, not added on top**, wherever
  Maskebari/VAT figures are derived from a document's `total_amount`:
  `taxable_amount = round(total_amount / 1.13, 2)`,
  `vat_amount = round(taxable_amount * 0.13, 2)`.
- **VAT carry-forward is a stateful monthly walk, not a per-month formula**
  — it replays from the earliest VAT-relevant transaction ever recorded,
  carrying unused credit or unpaid liability forward each month. A
  reimplementation that only looks at "this month" will get the wrong
  number the moment there's a carried balance.
- **Bank balance is ledger-only** — the opening balance is itself a
  `credit` row inside the transactions ledger, never a separately-added
  starting figure. `balance = Σcredit − Σdebit` over the full ledger, every
  time it's computed (dashboard, bank account list, balance sheet all use
  this same formula — keep one shared function, don't reimplement it per
  screen).
- **BS/AD dual calendar** exists in the legacy app specifically because
  Nepal VAT filing (Maskebari) runs on BS months — this reinforces
  `../AGENTS.md` §4, it isn't a new requirement.

**Explicitly do NOT carry over**: the legacy DB layer has no prepared
statements (values are inlined after `mysqli_real_escape_string()`). That's
a security anti-pattern, not business logic — `suva-erp` must use
parameterized queries. "Port logic exactly" never extends to SQL injection
risk.

**Open scope question — don't assume, confirm before building**: the legacy
system is a full multi-tenant SaaS (one physical database per tenant,
subdomain-based routing, a license/plan/module entitlement layer stacked on
top of role-based access, sandbox/multi-company support). Don't build this
multi-tenancy/licensing layer into `suva-erp` unless explicitly asked —
check first, since it's a large architecture commitment.

**Migration-script gotchas** (verify against the real `db/` folder once
provided, don't rely on the report alone):
- Several FK relationships are polymorphic and **not** DB-enforced
  (`bank_transactions.transaction_ref_id`, `delivery_challans.source_id`,
  `payment_allocations.document_id`, and others) — validate/handle orphaned
  references rather than assuming referential integrity held in production.
- `variant_id`: line-item/detail tables use `NULL` = no variant, but
  `inventories.variant_id` uses `0` = no variant (`NOT NULL DEFAULT 0`) —
  don't conflate the two when writing migration/join logic.
- `quantity` column type is inconsistent in the legacy schema (plain `INT`
  on order/quotation details, `DECIMAL(14,2)` on invoice/bill/credit/debit
  details, `DECIMAL(15,4)` on delivery challan items) — decide deliberately
  whether `suva-erp` standardizes this instead of silently changing
  precision behavior during migration.

