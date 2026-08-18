# Suva Design System

Source of truth for how Suva ERP looks and behaves. Written 2026-08-18 as
part of the flagship UI/UX redesign (see `redesign.md` at the workspace
root for the full brief this implements). Read this before styling a new
screen — match what's here instead of inventing a new pattern.

## 1. Philosophy

Suva is premium financial software, not a marketing site or an admin
template. Every decision below optimizes for:

- **Calm over flashy.** Gold is a signature, not wallpaper (~3–5% of any
  screen's surface area — see §3).
- **Numbers over icons.** A KPI card's value is the largest, boldest thing
  in it; icons are small and secondary.
- **Density with room to breathe.** This is a daily-use accounting tool —
  users spend hours in tables and forms, not admiring hero sections.
- **One product, one team.** Every module should look like it was built by
  the people who built the dashboard, not bolted on separately.

If a new screen makes you reach for a bright color, a big shadow, or a
giant card, that's usually the wrong instinct — reach for whitespace,
typography, or a border instead.

## 2. Tech foundation

Tailwind CSS v4, CSS-variable theming via `@theme inline` in
`src/app/globals.css` — **not** `tailwind.config.ts`. Every token is a CSS
custom property under `:root` / `.dark`, then re-exposed as a Tailwind
utility (`--color-success` → `bg-success` / `text-success`). Adding a new
semantic color always means adding it in both places, light **and** dark.

shadcn `base-nova` style + Base UI primitives. Component source lives in
`src/components/ui/` — some are shadcn-generated, several are hand-built
for this ERP specifically (`data-table.jsx`, `creatable-select.jsx`,
`animated-number.jsx`, `status-badge.jsx`, `chart.jsx`). Prefer extending
these over hand-rolling a one-off pattern in a page file.

## 3. Color tokens

### Brand gold

`--primary` (`#F7B500`) and `--ring` (`#FFC928`) are the two logo golds —
never renamed, don't recolor them. Added this pass:

| Token | Light | Purpose |
|---|---|---|
| `--brand-600` | `#C88917` | Darker interaction state, accessible text/icons on light surfaces |
| `--brand-soft` | pale warm gold | Large-surface tint (e.g. the dashboard welcome panel) — never a saturated fill |
| `--brand-border` | warm neutral | Border on a brand-tinted surface — reads "warm," not "yellow" |

**The 85/90–5/10–3/5 rule**: neutral surfaces dominate, typography/borders
carry structure, gold marks the one or two things per screen that are
actually branded (active nav state, primary buttons, the logo). A screen
that's more than ~5% gold has gone too far.

### Semantic status

| Token | Meaning | Used by |
|---|---|---|
| `--success` / `--success-soft` | completed, paid, healthy | `StatusBadge`, stock-alert "healthy" state |
| `--warning` / `--warning-soft` | pending, partial, low stock | `StatusBadge`, payable KPI |
| `--info` / `--info-soft` | sent, confirmed, informational | `StatusBadge` |
| `--receivable` (= `--info`) | money owed *to* the business | dashboard receivable KPI |
| `--payable` (= `--warning`) | money the business owes | dashboard payable KPI |
| `--destructive` (pre-existing) | overdue, bounced, blocking errors | forms, `StatusBadge` |

Never encode status with color alone — pair every tone with the actual
label text (see `status-badge.jsx`).

### Surfaces

`--background` (app canvas) → `--card`/`--surface-raised` (elevated
content) → `--surface-subtle` (a step below card, for nested/quiet areas).
Depth comes from border + a very small shadow, not large drop shadows.

## 4. Typography

One font stack (the project's existing `--font-sans`, with a Devanagari
fallback for `:lang(ne)` — see globals.css). Scale:

| Use | Size | Weight |
|---|---|---|
| Page title / dashboard greeting | 24–28px | 600 |
| Section title | 15–18px | 600 |
| Card label / standard UI | 12–14px | 400–500 |
| Supporting metadata | 11–12px | 400 |

Financial values: `tabular-nums` always (Tailwind's `tabular-nums` class),
right-aligned in tables, formatted through `formatMoney`/`formatMoneyCompact`
(`src/lib/money-format.js`) — never a hand-rolled `toLocaleString` call
in a page component.

## 5. Spacing & radius

Spacing rhythm: 4/8/12/16/20/24/32/40/48. Radius hierarchy (already encoded
via `--radius` and the `radius-sm/md/lg/xl/2xl` scale in globals.css):
controls & nav rows ~8–10px, cards ~12px (`rounded-xl`), dialogs/sheets
16–20px. Nothing uses `rounded-3xl`+ as a default.

## 6. App shell

- **Sidebar**: 264px expanded (`w-66`) / 72px collapsed (`w-18`), collapse
  state persisted to `localStorage`, hover-expands when collapsed. Optional
  uppercase section headings (`section.heading` in `lib/nav-sections.js`) —
  used for "Operations"/"Masters" where there's enough nav depth to need
  orientation, omitted for single-item sections where a heading would just
  be noise.
- **Active state**: pale gold-tinted background (`bg-primary/18`) + full-
  strength text + gold icon + a 3px inset left bar on top-level items.
  Never a solid saturated fill.
- **Topbar**: morphs between a floating pill (page top) and a bordered bar
  (scrolled) — kept from the pre-redesign shell because it reads as
  intentional, not gimmicky. Order: mobile menu → breadcrumb → search/
  command-palette trigger → (flex spacer) → Quick Create → report period →
  separator → theme → language → profile.
- **Command palette** (`components/command-menu.jsx`): Ctrl/Cmd+K, two
  groups (Navigate, Actions), both filtered by the same `accessibleModules`
  gating the sidebar uses. Static client-side search — no server round
  trip, since it's matching against already-loaded label lists.
- **Quick Create** (`components/quick-create.jsx`) and the command
  palette's Actions group share one data source
  (`lib/quick-create-items.js`) so they can never list different things.
- **Breadcrumb** (`components/breadcrumb.jsx`): derived from
  `lib/nav-sections.js`, the same data the sidebar renders from — never a
  second, hand-maintained route map. Shows one trailing `#id` or "New"
  segment past the matched static route; anything deeper is left off
  rather than guessed.

## 7. Status badges

One shared vocabulary (`components/ui/status-badge.jsx`) covering every
`mysqlEnum("status", ...)` value across Sales/Purchase/Finance:
draft, pending, ordered, sent, confirmed, accepted, received, delivered,
completed, paid, approved, cleared, active, converted, expired, inactive,
overdue, bounced, cancelled, partial. Add a new DB status value → add its
tone to `TONE` and its i18n key (both languages) in the same change.

## 8. Dashboard

`dashboard/page.js` is a Server Component that aggregates real data only —
no hardcoded figures anywhere. As of this pass it pulls from every live
module (Cash & Bank, Items/Inventory, Parties, Sales, Purchase, Finance)
and respects the existing report-period cookie (`lib/report-period.js`) —
the same period control already in the topbar, not a second date system.

- KPI row: Cash & Bank, Sales (period), Purchases (period), Receivables,
  Payables, Stock Alerts — only the ones the org actually has access to.
- **Business Performance** chart: sales vs. purchase, bucketed server-side
  (`buildTrendSeries` in `page.js`) — daily under 60 days in range, weekly
  under a year, monthly beyond that, so a fiscal-year range never renders
  hundreds of points.
- **Recent Activity**: the 4 highest-signal document types (sales
  invoices, purchase bills, payment in/out) merged and re-sorted by date,
  capped at 8 rows.
- **Welcome state**: a brand-new organization (zero bank accounts, items,
  parties, invoices, and bills) gets a setup checklist instead of an empty
  KPI grid — see `WelcomeState` in `dashboard-view.jsx`.

## 9. Charts

`components/ui/chart.jsx` is a small local wrapper around Recharts (added
this pass — `recharts@3`), not the full shadcn chart registry component.
Series colors come from a `config` object whose values become
`--color-<key>` CSS variables, so chart series stay theme-aware without
recomputing hex values in JS. Palette: brand gold for the primary series,
`--muted-foreground` for the comparison series, semantic success/
destructive only where a value is genuinely positive/negative — never a
rainbow palette, never 3D, never an unnecessary donut.

## 10. Motion

Timings already established in `src/lib/motion.js` and reused everywhere
new: ~150–220ms for common interactions (dropdowns, page transitions),
short stagger (~0.05–0.06s) for list entrances, `easeOut`, no bounce.
`prefers-reduced-motion: reduce` is handled globally in `globals.css` —
never bypass it with an inline animation that ignores the media query.

## 11. i18n & dual calendar

Every new string goes in `src/lib/i18n-resources.js` under **both** `en`
and `ne` in the same change — check parity after editing (regex-count
`^\s{6}key:` lines in each block, diff the sets; there's a one-liner for
this in `HANDOFF.md` §7). Never concatenate translated fragments across
languages (e.g. "New" + entity name) — Nepali word order isn't guaranteed
to match English, so compose full strings per language instead.

Dates: `components/dual-date-field.jsx` is the only BS/AD input. This pass
didn't touch it — it wasn't in scope for the shell/dashboard work — but any
new date field must use it, not a plain shadcn date picker.

## 12. What's intentionally NOT covered yet

This pass covered the design tokens, app shell (sidebar/topbar/command
palette/quick create/breadcrumb), and the dashboard. Not yet redesigned in
this pass, per `redesign.md`'s own phased order:

- Table density toggle (Comfortable/Compact) on `data-table.jsx` — the
  table itself already has search/filter/sort/bulk-actions/virtualization/
  skeleton states from earlier work, just not a density switch yet.
- Transaction form visual pass (invoice/bill/payment forms) — logic is
  correct and complete, presentation hasn't had this pass's treatment.
- Reports, Account area (Organizations/Module Store/Account Settings).
- A dedicated `/settings` page — referenced in the nav, but no page exists
  yet; pre-existing gap, not introduced by this pass.

Treat this document as living — update it in the same change whenever a
new pattern is established, not as a follow-up.
