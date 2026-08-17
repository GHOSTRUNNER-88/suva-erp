import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { listBankAccountsWithBalance } from "../bank-accounts/actions";
import { listInventoryTree } from "../items/inventory/actions";
import { listItems, listWarehouses } from "../items/actions";
import { listParties } from "../parties/actions";
import { listUnits } from "../units/actions";
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
// How many rows the "low stock" and "cash & bank" mini panels show before
// the user has to go to the full page — keeps the dashboard glanceable.
const PANEL_ROW_LIMIT = 8;

// Cents-based summation so adding several already-rounded 2-decimal money
// values (bank balances, party balances) can't drift from raw JS float
// addition — see ../../../../AGENTS.md §5. Every source value here already
// came out of a SQL SUM (see bank-accounts/actions.js, parties/actions.js),
// so this is just the final client-side rollup, not a replacement for those.
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

export default async function DashboardPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  const hasCashBank = context.accessibleModules.includes("cashBank");
  const hasItems = context.accessibleModules.includes("items");
  const hasParties = context.accessibleModules.includes("parties");
  const hasUnits = context.accessibleModules.includes("units");

  // Only fetch what this organization/role actually has access to — a
  // dashboard aggregates across modules, so a module being off just means
  // its card/panel doesn't render, not that the whole page 404s (unlike a
  // module's own page.js, which redirects on missing access).
  const [t, bankAccounts, items, inventoryTree, warehouses, parties, units] = await Promise.all([
    getServerT(),
    hasCashBank ? listBankAccountsWithBalance(company) : Promise.resolve([]),
    hasItems ? listItems(company) : Promise.resolve([]),
    hasItems ? listInventoryTree(company) : Promise.resolve([]),
    hasItems ? listWarehouses(company) : Promise.resolve([]),
    hasParties ? listParties(company) : Promise.resolve([]),
    hasUnits ? listUnits(company) : Promise.resolve([]),
  ]);

  const lowStockRows = hasItems ? findLowStock(inventoryTree, LOW_STOCK_THRESHOLD) : [];

  const summary = {
    cashBank: hasCashBank
      ? {
          total: sumMoney(bankAccounts.map((account) => account.currentBalance)),
          accounts: [...bankAccounts]
            .sort((a, b) => b.currentBalance - a.currentBalance)
            .slice(0, PANEL_ROW_LIMIT),
        }
      : null,
    parties: hasParties
      ? {
          count: parties.length,
          receivables: sumMoney(parties.filter((party) => Number(party.balance) > 0).map((party) => party.balance)),
          payables: sumMoney(
            parties.filter((party) => Number(party.balance) < 0).map((party) => Math.abs(Number(party.balance)))
          ),
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
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("dashboardTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("dashboardSubtitle")}</p>
        </div>
      </div>
      <DashboardView companySlug={company} accessibleModules={context.accessibleModules} summary={summary} />
    </div>
  );
}
