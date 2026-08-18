import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getReportPeriod } from "@/lib/report-period";
import { listBankAccountsWithBalance } from "../bank-accounts/actions";
import { listInventoryTree } from "../items/inventory/actions";
import { listItems, listWarehouses } from "../items/actions";
import { listParties } from "../parties/actions";
import { listUnits } from "../units/actions";
import { listSalesInvoices } from "../sales/invoices/actions";
import { listPurchaseBills } from "../purchase/bills/actions";
import { listPaymentsAction } from "../finance/payments-shared/actions";
import DashboardView from "./dashboard-view";

export const metadata = {
  title: "Dashboard",
};

// No reorder-level/minimum-stock field exists on items or inventory rows
// yet (see items/inventory/actions.js) — 5 units is a reasonable default
// "getting low" alert threshold picked for this dashboard, not a value read
// from anywhere. Revisit once a real per-item/warehouse reorder level is
// configurable.
const LOW_STOCK_THRESHOLD = 5;
// How many rows the mini panels (bank accounts, low stock, recent activity)
// show before the user has to go to the full page — keeps the dashboard
// glanceable, per redesign.md's "5-second scan" bar.
const PANEL_ROW_LIMIT = 8;
// How many of each document type feed the merged "recent activity" list —
// each source list is already sorted desc(id), so taking the first N per
// type and re-merging by date is enough without a dedicated union query.
const RECENT_PER_TYPE = 6;

// Cents-based summation so adding several already-rounded 2-decimal money
// values (bank balances, party balances, invoice/bill totals) can't drift
// from raw JS float addition — see ../../../../AGENTS.md §5. Every source
// value here already came out of a SQL SUM or a stored decimal column, so
// this is just the final client-side rollup, not a replacement for those.
function sumMoney(values) {
  const cents = values.reduce((total, value) => total + Math.round((Number(value) || 0) * 100), 0);
  return cents / 100;
}

// Flattens the item -> variant -> warehouse tree from listInventoryTree into
// one row per (item, variant, warehouse) that's at or below the threshold,
// sorted most-critical (lowest quantity) first — the shape the "Stock
// Alerts" panel and KPI count both consume.
function findLowStock(inventoryTree, threshold) {
  const rows = [];
  for (const item of inventoryTree) {
    for (const variant of item.variants) {
      for (const warehouse of variant.warehouses) {
        if (warehouse.quantity <= threshold) {
          rows.push({
            itemId: item.id,
            itemName: item.name,
            variantName: variant.valueName ?? null,
            warehouseId: warehouse.warehouseId,
            warehouseName: warehouse.warehouseName,
            quantity: warehouse.quantity,
            unitCode: item.primaryUnitCode,
          });
        }
      }
    }
  }
  return rows.sort((a, b) => a.quantity - b.quantity);
}

function inPeriod(dateValue, from, to) {
  return dateValue >= from && dateValue <= to;
}

function addDaysIso(dateIso, days) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonthsIso(dateIso, months) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function weekStartIso(dateIso) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const isoDow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - isoDow);
  return d.toISOString().slice(0, 10);
}

function bucketKeyFor(dateIso, granularity) {
  if (granularity === "day") return dateIso;
  if (granularity === "week") return weekStartIso(dateIso);
  return `${dateIso.slice(0, 7)}-01`;
}

// Server-side aggregation for the "Business Performance" chart: buckets
// already-fetched, period-filtered invoice/bill rows into a compact
// {date, sales, purchases} series (see redesign.md's PERFORMANCE rule —
// never ship raw transaction rows to the client just to draw a chart).
// Granularity adapts to the selected period so a fiscal-year range doesn't
// render 365 points: <=60 days -> daily, <=366 days -> weekly, else monthly.
// Every bucket in range is pre-seeded at zero so a quiet day/week never
// reads as a gap in the line.
function buildTrendSeries({ from, to, salesRows, purchaseRows }) {
  const dayCount = Math.max(
    Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86_400_000) + 1,
    1
  );
  const granularity = dayCount > 366 ? "month" : dayCount > 60 ? "week" : "day";
  const buckets = new Map();

  function ensure(key) {
    if (!buckets.has(key)) buckets.set(key, { date: key, sales: 0, purchases: 0 });
    return buckets.get(key);
  }

  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 400) {
    ensure(bucketKeyFor(cursor, granularity));
    cursor = granularity === "month" ? addMonthsIso(cursor, 1) : addDaysIso(cursor, granularity === "week" ? 7 : 1);
    guard += 1;
  }

  for (const row of salesRows) ensure(bucketKeyFor(row.invoiceDate, granularity)).sales += Number(row.totalAmount);
  for (const row of purchaseRows) ensure(bucketKeyFor(row.billDate, granularity)).purchases += Number(row.totalAmount);

  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Merges the 4 highest-signal document types into one "what happened
// recently" feed (redesign.md's RECENT ACTIVITY section) — each source is
// already sorted desc(id) from its own module's action, so this just takes
// the first N of each and re-sorts the merged, much smaller set by date.
function buildRecentActivity({ companySlug, salesInvoices, purchaseBills, paymentsIn, paymentsOut }) {
  const entries = [
    ...salesInvoices.slice(0, RECENT_PER_TYPE).map((row) => ({
      key: `si-${row.id}`,
      type: "salesInvoice",
      number: row.invoiceNumber,
      date: row.invoiceDate,
      partyName: row.partyName,
      amount: Number(row.totalAmount),
      direction: "in",
      status: row.status,
      href: `/${companySlug}/sales/invoices/${row.id}`,
    })),
    ...purchaseBills.slice(0, RECENT_PER_TYPE).map((row) => ({
      key: `pb-${row.id}`,
      type: "purchaseBill",
      number: row.billNumber,
      date: row.billDate,
      partyName: row.partyName,
      amount: Number(row.totalAmount),
      direction: "out",
      status: row.status,
      href: `/${companySlug}/purchase/bills/${row.id}`,
    })),
    ...paymentsIn.slice(0, RECENT_PER_TYPE).map((row) => ({
      key: `pi-${row.id}`,
      type: "paymentIn",
      number: row.receiptNumber,
      date: row.paymentDate,
      partyName: row.partyName ?? row.bankLabel,
      amount: Number(row.amount),
      direction: "in",
      status: null,
      href: `/${companySlug}/finance/payment-in`,
    })),
    ...paymentsOut.slice(0, RECENT_PER_TYPE).map((row) => ({
      key: `po-${row.id}`,
      type: "paymentOut",
      number: row.receiptNumber,
      date: row.paymentDate,
      partyName: row.partyName ?? row.bankLabel,
      amount: Number(row.amount),
      direction: "out",
      status: null,
      href: `/${companySlug}/finance/payment-out`,
    })),
  ];
  return entries.sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key)).slice(0, PANEL_ROW_LIMIT);
}

export default async function DashboardPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);
  const period = await getReportPeriod();

  const hasCashBank = context.accessibleModules.includes("cashBank");
  const hasItems = context.accessibleModules.includes("items");
  const hasParties = context.accessibleModules.includes("parties");
  const hasUnits = context.accessibleModules.includes("units");
  const hasSales = context.accessibleModules.includes("sales");
  const hasPurchase = context.accessibleModules.includes("purchase");
  const hasFinance = context.accessibleModules.includes("finance");

  const [bankAccounts, items, inventoryTree, warehouses, parties, units, salesInvoices, purchaseBills, paymentsIn, paymentsOut] =
    await Promise.all([
      hasCashBank ? listBankAccountsWithBalance(company) : Promise.resolve([]),
      hasItems ? listItems(company) : Promise.resolve([]),
      hasItems ? listInventoryTree(company) : Promise.resolve([]),
      hasItems ? listWarehouses(company) : Promise.resolve([]),
      hasParties ? listParties(company) : Promise.resolve([]),
      hasUnits ? listUnits(company) : Promise.resolve([]),
      hasSales ? listSalesInvoices(company) : Promise.resolve([]),
      hasPurchase ? listPurchaseBills(company) : Promise.resolve([]),
      hasFinance ? listPaymentsAction(company, "in") : Promise.resolve([]),
      hasFinance ? listPaymentsAction(company, "out") : Promise.resolve([]),
    ]);

  const lowStockRows = hasItems ? findLowStock(inventoryTree, LOW_STOCK_THRESHOLD) : [];

  const salesInPeriod = salesInvoices.filter((row) => row.status !== "cancelled" && inPeriod(row.invoiceDate, period.from, period.to));
  const purchasesInPeriod = purchaseBills.filter((row) => row.status !== "cancelled" && inPeriod(row.billDate, period.from, period.to));

  const summary = {
    period,
    cashBank: hasCashBank
      ? {
          total: sumMoney(bankAccounts.map((account) => account.currentBalance)),
          accountCount: bankAccounts.length,
          accounts: [...bankAccounts].sort((a, b) => b.currentBalance - a.currentBalance).slice(0, PANEL_ROW_LIMIT),
        }
      : null,
    parties: hasParties
      ? {
          count: parties.length,
          receivables: sumMoney(parties.filter((party) => Number(party.balance) > 0).map((party) => party.balance)),
          receivablesCount: parties.filter((party) => Number(party.balance) > 0).length,
          payables: sumMoney(parties.filter((party) => Number(party.balance) < 0).map((party) => Math.abs(Number(party.balance)))),
          payablesCount: parties.filter((party) => Number(party.balance) < 0).length,
        }
      : null,
    items: hasItems
      ? {
          count: items.length,
          warehousesCount: warehouses.length,
          lowStockThreshold: LOW_STOCK_THRESHOLD,
          lowStockCount: lowStockRows.length,
          lowStockAlerts: lowStockRows.slice(0, PANEL_ROW_LIMIT),
        }
      : null,
    units: hasUnits ? { count: units.length } : null,
    sales: hasSales
      ? {
          total: sumMoney(salesInPeriod.map((row) => row.totalAmount)),
          count: salesInPeriod.length,
        }
      : null,
    purchase: hasPurchase
      ? {
          total: sumMoney(purchasesInPeriod.map((row) => row.totalAmount)),
          count: purchasesInPeriod.length,
        }
      : null,
    trend: hasSales || hasPurchase ? buildTrendSeries({ from: period.from, to: period.to, salesRows: salesInPeriod, purchaseRows: purchasesInPeriod }) : [],
    recentActivity:
      hasSales || hasPurchase || hasFinance
        ? buildRecentActivity({ companySlug: company, salesInvoices, purchaseBills, paymentsIn, paymentsOut })
        : [],
    isEmpty: bankAccounts.length === 0 && items.length === 0 && parties.length === 0 && salesInvoices.length === 0 && purchaseBills.length === 0,
    setupSteps: {
      hasWarehouse: warehouses.length > 0,
      hasItem: items.length > 0,
      hasParty: parties.length > 0,
      hasInvoice: salesInvoices.length > 0,
    },
  };

  return (
    <DashboardView
      companySlug={company}
      accessibleModules={context.accessibleModules}
      summary={summary}
      firstName={context.user.firstName}
    />
  );
}
