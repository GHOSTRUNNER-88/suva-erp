"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  FileBarChart2,
  Landmark,
  Package,
  ReceiptText,
  Ruler,
  ShieldCheck,
  Users,
  Warehouse,
} from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// moduleKey gates the tile the same way it gates the sidebar (see
// components/app-shell.jsx) — omit it for tiles that aren't a purchasable
// module (Settings is always available).
const MODULES = [
  { label: "sales", text: "salesText", href: "sales", icon: ReceiptText, moduleKey: "sales" },
  { label: "purchase", text: "purchaseText", href: "purchase", icon: CircleDollarSign, moduleKey: "purchase" },
  { label: "cashBank", text: "cashBankText", href: "bank-accounts", icon: Landmark, moduleKey: "cashBank" },
  { label: "items", text: "itemsText", href: "items", icon: Package, moduleKey: "items" },
  { label: "units", text: "unitsText", href: "units", icon: Ruler, moduleKey: "units" },
  { label: "parties", text: "partiesText", href: "parties", icon: ShieldCheck, moduleKey: "parties" },
  { label: "reports", text: "reportsText", href: "reports", icon: FileBarChart2, moduleKey: "reports" },
  { label: "settings", text: "settingsText", href: "settings", icon: Building2 },
];

// Short, restrained stagger/fade-in — matches the durations already used by
// components/ui/sheet.jsx, modal.jsx, and data-table.jsx's bulk-action bar
// (0.15–0.25s, easeOut, no bounce). This is a dashboard for daily accounting
// work, not a marketing page, so entrances stay quick and never block input.
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

function formatMoney(amount) {
  return `NPR ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCount(amount) {
  return Math.round(amount).toLocaleString("en-IN");
}

function accountLabel(account) {
  return account.displayName ? `${account.bankName} (${account.displayName})` : account.bankName;
}

/**
 * Dashboard home — KPI row + module launcher + two "what needs attention"
 * mini panels, all fed with real data computed server-side in page.js
 * (cash & bank balances, party receivables/payables, low-stock alerts).
 * A module's KPI/panel simply doesn't render when `summary.<module>` is
 * null, which page.js only sets once that module is actually accessible —
 * mirrors the same accessibleModules gating the sidebar uses, so a
 * disabled module never causes a hard page failure here.
 */
export default function DashboardView({ companySlug, accessibleModules = [], summary }) {
  const { t } = useTranslation();

  const visibleModules = MODULES.filter(
    (module) => !module.moduleKey || accessibleModules.includes(module.moduleKey)
  );

  const kpis = [];
  if (summary.cashBank) {
    kpis.push({
      key: "cashBank",
      label: t("cashBank"),
      value: summary.cashBank.total,
      format: formatMoney,
      icon: Landmark,
      tone: "text-foreground",
      href: `/${companySlug}/bank-accounts`,
    });
  }
  if (summary.parties) {
    kpis.push({
      key: "receivables",
      label: t("receivables"),
      value: summary.parties.receivables,
      format: formatMoney,
      icon: ArrowUpRight,
      tone: "text-emerald-600 dark:text-emerald-500",
      href: `/${companySlug}/parties`,
    });
    kpis.push({
      key: "payables",
      label: t("payables"),
      value: summary.parties.payables,
      format: formatMoney,
      icon: ArrowDownRight,
      tone: "text-amber-700 dark:text-amber-500",
      href: `/${companySlug}/parties`,
    });
  }
  if (summary.items) {
    kpis.push({
      key: "stockAlerts",
      label: t("stockAlerts"),
      value: summary.items.lowStockCount,
      format: formatCount,
      icon: AlertTriangle,
      tone: summary.items.lowStockCount > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-500",
      href: `/${companySlug}/items/inventory`,
    });
  }

  const overviewStats = [
    summary.items && { key: "items", label: t("items"), value: summary.items.count, icon: Package },
    summary.parties && { key: "parties", label: t("parties"), value: summary.parties.count, icon: Users },
    summary.items && {
      key: "warehouses",
      label: t("warehouses"),
      value: summary.items.warehousesCount,
      icon: Warehouse,
    },
    summary.units && { key: "units", label: t("units"), value: summary.units.count, icon: Ruler },
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      {kpis.length > 0 && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {kpis.map((kpi) => (
            <motion.div key={kpi.key} variants={itemVariants}>
              <Link href={kpi.href} className="block h-full">
                <Card className="h-full rounded-xl transition-shadow hover:shadow-md">
                  <CardHeader className="flex-row items-start justify-between gap-3">
                    <div>
                      <CardDescription>{kpi.label}</CardDescription>
                      <CardTitle className={cn("mt-2 text-xl tabular-nums", kpi.tone)}>
                        <AnimatedNumber value={kpi.value} format={kpi.format} />
                      </CardTitle>
                    </div>
                    <div className="rounded-xl bg-primary/12 p-2 text-primary">
                      <kpi.icon className="h-4 w-4" />
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}

      {overviewStats.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut", delay: 0.12 }}>
          <Card className="rounded-xl">
            <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3">
              {overviewStats.map((stat) => (
                <div key={stat.key} className="flex items-center gap-2.5">
                  <div className="rounded-lg bg-muted p-1.5">
                    <stat.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold tabular-nums">
                      <AnimatedNumber value={stat.value} format={formatCount} />
                    </p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">{t("modules")}</h2>
          </div>
          {visibleModules.length === 0 ? (
            <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">{t("noModuleAccess")}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {visibleModules.map((module) => {
                const Icon = module.icon;
                return (
                  <Card key={module.label} className="rounded-xl transition-shadow hover:shadow-md">
                    <CardHeader className="flex-row items-start gap-3">
                      <div className="rounded-xl bg-muted p-2">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle>{t(module.label)}</CardTitle>
                        <CardDescription>{t(module.text)}</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Link
                        href={`/${companySlug}/${module.href}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {t("openModule")}
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {(summary.cashBank || summary.items) && (
          <section className="space-y-6">
            {summary.cashBank && <CashBankPanel companySlug={companySlug} cashBank={summary.cashBank} t={t} />}
            {summary.items && <LowStockPanel companySlug={companySlug} items={summary.items} t={t} />}
          </section>
        )}
      </div>
    </div>
  );
}

function CashBankPanel({ companySlug, cashBank, t }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("bankAccounts")}</h2>
        <Link href={`/${companySlug}/bank-accounts`} className="text-xs font-medium text-primary hover:underline">
          {t("viewAll")}
        </Link>
      </div>
      <Card className="rounded-xl">
        <CardContent>
          {cashBank.accounts.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">{t("noBankAccountsYet")}</p>
          ) : (
            <motion.div variants={containerVariants} initial="hidden" animate="show" className="divide-y">
              {cashBank.accounts.map((account) => (
                <motion.div
                  key={account.id}
                  variants={itemVariants}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0 truncate text-sm">{accountLabel(account)}</span>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-medium tabular-nums",
                      account.currentBalance < 0 ? "text-destructive" : "text-foreground"
                    )}
                  >
                    NPR{" "}
                    {Math.abs(account.currentBalance).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LowStockPanel({ companySlug, items, t }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("stockAlerts")}</h2>
        <Link href={`/${companySlug}/items/inventory`} className="text-xs font-medium text-primary hover:underline">
          {t("viewAll")}
        </Link>
      </div>
      <Card className="rounded-xl">
        <CardContent>
          {items.lowStockAlerts.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">{t("allStockHealthy")}</p>
          ) : (
            <motion.div variants={containerVariants} initial="hidden" animate="show" className="divide-y">
              {items.lowStockAlerts.map((row) => (
                <motion.div
                  key={`${row.itemId}-${row.variantName ?? "base"}-${row.warehouseId}`}
                  variants={itemVariants}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {row.itemName}
                      {row.variantName ? ` — ${row.variantName}` : ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{row.warehouseName}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-medium tabular-nums",
                      row.quantity <= 0 ? "text-destructive" : "text-amber-700 dark:text-amber-500"
                    )}
                  >
                    {row.quantity} {row.unitCode}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
