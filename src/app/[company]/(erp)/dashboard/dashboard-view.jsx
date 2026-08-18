"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Check,
  CircleDollarSign,
  FileBarChart2,
  FileText,
  Landmark,
  Package,
  ReceiptText,
  Ruler,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCount, formatMoney, formatMoneyCompact } from "@/lib/money-format";
import { cn } from "@/lib/utils";

// moduleKey gates the tile the same way it gates the sidebar (see
// components/app-shell.jsx) — omit it for tiles that aren't a purchasable
// module (Settings is always available).
const MODULES = [
  { label: "sales", href: "sales/invoices", icon: ReceiptText, moduleKey: "sales" },
  { label: "purchase", href: "purchase/bills", icon: CircleDollarSign, moduleKey: "purchase" },
  { label: "cashBank", href: "bank-accounts", icon: Landmark, moduleKey: "cashBank" },
  { label: "items", href: "items", icon: Package, moduleKey: "items" },
  { label: "units", href: "units", icon: Ruler, moduleKey: "units" },
  { label: "parties", href: "parties", icon: ShieldCheck, moduleKey: "parties" },
  { label: "reports", href: "reports", icon: FileBarChart2, moduleKey: "reports" },
  { label: "settings", href: "settings", icon: Building2 },
];

const ACTIVITY_ICON = {
  salesInvoice: ReceiptText,
  purchaseBill: FileText,
  paymentIn: ArrowUpRight,
  paymentOut: ArrowDownRight,
};

// Short, restrained stagger/fade-in — matches the durations already used by
// components/ui/sheet.jsx, modal.jsx, and data-table.jsx's bulk-action bar
// (0.15–0.25s, easeOut, no bounce). This is a dashboard for daily accounting
// work, not a marketing page, so entrances stay quick and never block input.
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

function accountLabel(account) {
  return account.displayName ? `${account.bankName} (${account.displayName})` : account.bankName;
}

function formatAxisDate(dateIso) {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Dashboard home — the flagship screen (redesign.md PHASE 4). Greeting +
 * KPI row + business-performance chart + cash/bank & stock panels + a
 * merged recent-activity feed + a compact quick-access launcher, all fed
 * with real data computed server-side in page.js. A module's KPI/panel
 * simply doesn't render when `summary.<module>` is null, which page.js only
 * sets once that module is actually accessible — mirrors the same
 * accessibleModules gating the sidebar uses, so a disabled module never
 * causes a hard page failure here. A brand-new organization with no data at
 * all gets a dedicated welcome checklist instead of an empty grid.
 */
export default function DashboardView({ companySlug, accessibleModules = [], summary, firstName }) {
  const { t } = useTranslation();
  // SSR has no reliable notion of the *viewer's* local time of day (the
  // Node process may run in a different timezone entirely) — render a
  // neutral default on first paint, then correct client-side after mount,
  // same "server default, client-corrects" shape as app-shell.jsx's
  // sidebar-collapsed sync and report-period-picker.jsx's cookie sync.
  const [greetingKey, setGreetingKey] = useState("dashboardGreetingMorning");
  useEffect(() => {
    const hour = new Date().getHours();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreetingKey(hour < 12 ? "dashboardGreetingMorning" : hour < 17 ? "dashboardGreetingAfternoon" : "dashboardGreetingEvening");
  }, []);

  const visibleModules = MODULES.filter((module) => !module.moduleKey || accessibleModules.includes(module.moduleKey));

  if (summary.isEmpty) {
    return (
      <WelcomeState
        companySlug={companySlug}
        accessibleModules={accessibleModules}
        firstName={firstName}
        greetingKey={greetingKey}
        steps={summary.setupSteps}
        modules={visibleModules}
        t={t}
      />
    );
  }

  const kpis = [];
  if (summary.cashBank) {
    kpis.push({
      key: "cashBank",
      label: t("cashBank"),
      value: summary.cashBank.total,
      format: formatMoney,
      icon: Landmark,
      hint: summary.cashBank.accountCount > 0 ? t("cashAcrossAccounts", { count: summary.cashBank.accountCount }) : null,
      href: `/${companySlug}/bank-accounts`,
    });
  }
  if (summary.sales) {
    kpis.push({
      key: "sales",
      label: t("sales"),
      value: summary.sales.total,
      format: formatMoney,
      icon: ReceiptText,
      hint: t("salesInvoiceCount", { count: summary.sales.count }),
      href: `/${companySlug}/sales/invoices`,
    });
  }
  if (summary.purchase) {
    kpis.push({
      key: "purchase",
      label: t("purchase"),
      value: summary.purchase.total,
      format: formatMoney,
      icon: FileText,
      hint: t("purchaseBillCount", { count: summary.purchase.count }),
      href: `/${companySlug}/purchase/bills`,
    });
  }
  if (summary.parties) {
    kpis.push({
      key: "receivables",
      label: t("receivables"),
      value: summary.parties.receivables,
      format: formatMoney,
      icon: ArrowUpRight,
      tone: "text-success",
      hint: summary.parties.receivablesCount > 0 ? t("partiesOweYou", { count: summary.parties.receivablesCount }) : null,
      href: `/${companySlug}/parties`,
    });
    kpis.push({
      key: "payables",
      label: t("payables"),
      value: summary.parties.payables,
      format: formatMoney,
      icon: ArrowDownRight,
      tone: "text-warning",
      hint: summary.parties.payablesCount > 0 ? t("youOweParties", { count: summary.parties.payablesCount }) : null,
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
      tone: summary.items.lowStockCount > 0 ? "text-destructive" : "text-success",
      href: `/${companySlug}/items/inventory`,
    });
  }

  const chartConfig = {
    sales: { label: t("sales"), color: "#F7B500" },
    purchases: { label: t("purchase"), color: "var(--muted-foreground)" },
  };
  const hasTrendData = summary.trend.some((point) => point.sales > 0 || point.purchases > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(greetingKey, { name: firstName })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("dashboardFlagshipSubtitle")}</p>
        </div>
      </div>

      {kpis.length > 0 && (
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {kpis.map((kpi) => (
            <motion.div key={kpi.key} variants={itemVariants}>
              <Link href={kpi.href} className="block h-full">
                <Card className="h-full rounded-xl transition-shadow hover:shadow-md">
                  <CardHeader className="flex-row items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardDescription>{kpi.label}</CardDescription>
                      <CardTitle className={cn("mt-2 text-xl tabular-nums", kpi.tone)}>
                        <AnimatedNumber value={kpi.value} format={kpi.format} />
                      </CardTitle>
                      {kpi.hint && <p className="mt-1 truncate text-xs text-muted-foreground">{kpi.hint}</p>}
                    </div>
                    <div className="shrink-0 rounded-xl bg-primary/12 p-2 text-primary">
                      <kpi.icon className="h-4 w-4" />
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        {(summary.sales || summary.purchase) && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut", delay: 0.1 }}>
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle>{t("businessPerformance")}</CardTitle>
                <CardDescription>{t("salesVsPurchase")}</CardDescription>
              </CardHeader>
              <CardContent>
                {hasTrendData ? (
                  <div className="h-64">
                    <ChartContainer config={chartConfig}>
                      <AreaChart data={summary.trend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-sales)" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="var(--color-sales)" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatAxisDate}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                          minTickGap={32}
                        />
                        <YAxis
                          tickFormatter={formatMoneyCompact}
                          tickLine={false}
                          axisLine={false}
                          width={64}
                          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                        />
                        <ChartTooltip
                          content={<ChartTooltipContent config={chartConfig} formatter={formatMoney} labelFormatter={formatAxisDate} />}
                        />
                        <Area
                          type="monotone"
                          dataKey="sales"
                          stroke="var(--color-sales)"
                          fill="url(#fillSales)"
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey="purchases"
                          stroke="var(--color-purchases)"
                          fill="none"
                          strokeWidth={2}
                          strokeDasharray="4 3"
                        />
                      </AreaChart>
                    </ChartContainer>
                  </div>
                ) : (
                  <p className="py-16 text-center text-sm text-muted-foreground">{t("noResults")}</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {summary.cashBank && (
          <section>
            <PanelHeader title={t("bankAccounts")} href={`/${companySlug}/bank-accounts`} t={t} />
            <Card className="rounded-xl">
              <CardContent>
                {summary.cashBank.accounts.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">{t("noBankAccountsYet")}</p>
                ) : (
                  <motion.div variants={containerVariants} initial="hidden" animate="show" className="divide-y">
                    {summary.cashBank.accounts.map((account) => (
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
                          {formatMoney(account.currentBalance)}
                        </span>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </section>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        {(accessibleModules.includes("sales") || accessibleModules.includes("purchase") || accessibleModules.includes("finance")) && (
          <section>
            <PanelHeader title={t("recentActivity")} t={t} />
            <Card className="rounded-xl">
              <CardContent>
                {summary.recentActivity.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">{t("noRecentActivity")}</p>
                ) : (
                <motion.div variants={containerVariants} initial="hidden" animate="show" className="divide-y">
                  {summary.recentActivity.map((entry) => {
                    const Icon = ACTIVITY_ICON[entry.type] ?? ReceiptText;
                    return (
                      <motion.div
                        key={entry.key}
                        variants={itemVariants}
                        className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <div
                          className={cn(
                            "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                            entry.direction === "in" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">{entry.number ?? t(entry.type)}</p>
                            {entry.status && <StatusBadge status={entry.status} />}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{entry.partyName ?? "—"}</p>
                        </div>
                        <Link href={entry.href} className="shrink-0 text-sm font-medium tabular-nums hover:underline">
                          {formatMoney(entry.amount)}
                        </Link>
                      </motion.div>
                    );
                  })}
                </motion.div>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {summary.items && (
          <section>
            <PanelHeader title={t("stockAlerts")} href={`/${companySlug}/items/inventory`} t={t} />
            <Card className="rounded-xl">
              <CardContent>
                {summary.items.lowStockAlerts.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">{t("allStockHealthy")}</p>
                ) : (
                  <motion.div variants={containerVariants} initial="hidden" animate="show" className="divide-y">
                    {summary.items.lowStockAlerts.map((row) => (
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
                            row.quantity <= 0 ? "text-destructive" : "text-warning"
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
          </section>
        )}
      </div>

      <QuickAccess companySlug={companySlug} modules={visibleModules} t={t} />
    </div>
  );
}

function PanelHeader({ title, href, t }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-semibold">{title}</h2>
      {href && (
        <Link href={href} className="text-xs font-medium text-primary hover:underline">
          {t("viewAll")}
        </Link>
      )}
    </div>
  );
}

function QuickAccess({ companySlug, modules, t }) {
  if (modules.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">{t("quickAccess")}</h2>
      <div className="flex flex-wrap gap-2.5">
        {modules.map((module) => (
          <Link
            key={module.label}
            href={`/${companySlug}/${module.href}`}
            className="flex items-center gap-2 rounded-xl border bg-card px-3.5 py-2.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/6"
          >
            <module.icon className="h-4 w-4 text-primary" />
            {t(module.label)}
          </Link>
        ))}
      </div>
    </section>
  );
}

function WelcomeState({ companySlug, accessibleModules, firstName, greetingKey, steps, modules, t }) {
  const STEPS = [
    { key: "hasWarehouse", labelKey: "welcomeStepWarehouse", href: "items/warehouses", moduleKey: "items" },
    { key: "hasItem", labelKey: "welcomeStepItem", href: "items", moduleKey: "items" },
    { key: "hasParty", labelKey: "welcomeStepParty", href: "parties", moduleKey: "parties" },
    { key: "hasInvoice", labelKey: "welcomeStepInvoice", href: "sales/invoices/new", moduleKey: "sales" },
  ].filter((step) => !step.moduleKey || accessibleModules.includes(step.moduleKey));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t(greetingKey, { name: firstName })}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("dashboardFlagshipSubtitle")}</p>
      </div>

      <Card className="rounded-2xl border border-brand-border bg-brand-soft">
        <CardContent className="flex flex-col gap-5 py-2">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-base font-semibold">{t("welcomeTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("welcomeSubtitle")}</p>
            </div>
          </div>
          <ol className="space-y-1">
            {STEPS.map((step) => {
              const done = steps[step.key];
              return (
                <li key={step.key}>
                  <Link
                    href={`/${companySlug}/${step.href}`}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm transition-colors hover:bg-background/60"
                  >
                    <span
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px]",
                        done ? "border-success bg-success-soft text-success" : "border-border bg-background text-muted-foreground"
                      )}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span className={cn(done && "text-muted-foreground line-through decoration-1")}>{t(step.labelKey)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <QuickAccess companySlug={companySlug} modules={modules} t={t} />
    </div>
  );
}
