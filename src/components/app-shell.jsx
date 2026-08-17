"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { pageVariants, pageTransition } from "@/lib/motion";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import {
  Building2,
  ChevronRight,
  CircleDollarSign,
  FileBarChart2,
  FileText,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Sun,
  UserCog,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { ReportPeriodPicker } from "@/components/report-period-picker";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "suva-sidebar-collapsed";

const ACCOUNT_NAV_SECTIONS = [
  {
    key: "account",
    items: [
      { label: "accountDashboard", href: "account/dashboard", icon: UserCog },
      { label: "organizations", href: "account/organizations", icon: Building2 },
      { label: "moduleStore", href: "account/modules", icon: Store },
    ],
  },
  // The reverse trip (ERP -> Account) already exists via the avatar menu's
  // "Account Settings" link — this is the direction that had no way back.
  {
    key: "workspace",
    items: [{ label: "switchToErp", href: "dashboard", icon: LayoutDashboard }],
  },
];

// `moduleKey` (see lib/modules.js) gates a leaf item or a group's child —
// hidden unless it's in accessibleModules (the active organization's enabled
// modules ∩ what this user is permitted to use, see lib/auth/app-context.js).
// Items with no moduleKey (dashboard, settings) are always visible to any
// org member. Items with `children` render as an expand/collapse group
// instead of a link — see the nav render loop below.
const ERP_NAV_SECTIONS = [
  {
    key: "workspace",
    items: [{ label: "erpDashboard", href: "dashboard", icon: LayoutDashboard }],
  },
  {
    key: "operations",
    items: [
      {
        key: "sales",
        label: "sales",
        icon: ReceiptText,
        children: [
          { label: "quotations", href: "sales/quotations", moduleKey: "sales" },
          { label: "salesOrders", href: "sales/orders", moduleKey: "sales" },
          { label: "salesInvoices", href: "sales/invoices", moduleKey: "sales" },
          { label: "creditNotes", href: "sales/credit-notes", moduleKey: "sales" },
          { label: "deliveryChallans", href: "sales/delivery-challans", moduleKey: "sales" },
        ],
      },
      {
        key: "purchase",
        label: "purchase",
        icon: FileText,
        children: [
          { label: "purchaseOrders", href: "purchase/orders", moduleKey: "purchase" },
          { label: "purchaseBills", href: "purchase/bills", moduleKey: "purchase" },
          { label: "expenses", href: "purchase/expenses", moduleKey: "purchase" },
          { label: "expenseCategories", href: "purchase/expense-categories", moduleKey: "purchase" },
          { label: "debitNotes", href: "purchase/debit-notes", moduleKey: "purchase" },
        ],
      },
      {
        key: "finance",
        label: "finance",
        icon: CircleDollarSign,
        children: [
          { label: "paymentIn", href: "finance/payment-in", moduleKey: "finance" },
          { label: "paymentOut", href: "finance/payment-out", moduleKey: "finance" },
          { label: "chequeRegister", href: "finance/cheque-register", moduleKey: "finance" },
          { label: "paymentsDue", href: "finance/payments-due", moduleKey: "finance" },
        ],
      },
      // Only one child in legacy (Bank Accounts) — a group of one adds a
      // click with no payoff, so this stays a plain link, unlike its
      // multi-child siblings above.
      { label: "cashBank", href: "bank-accounts", icon: Landmark, moduleKey: "cashBank" },
      {
        key: "payroll",
        label: "payroll",
        icon: Users,
        children: [
          { label: "staff", href: "payroll/staff", moduleKey: "payroll" },
          { label: "runPayroll", href: "payroll/run", moduleKey: "payroll" },
        ],
      },
    ],
  },
  {
    key: "masters",
    items: [
      {
        key: "parties",
        label: "parties",
        icon: ShieldCheck,
        children: [
          { label: "parties", href: "parties", moduleKey: "parties" },
          { label: "partyGroups", href: "parties/groups", moduleKey: "parties" },
        ],
      },
      {
        key: "items",
        label: "items",
        icon: Package,
        children: [
          { label: "items", href: "items", moduleKey: "items" },
          { label: "inventory", href: "items/inventory", moduleKey: "items" },
          { label: "itemCategories", href: "items/categories", moduleKey: "items" },
          { label: "attributes", href: "items/attributes", moduleKey: "items" },
          { label: "warehouses", href: "items/warehouses", moduleKey: "items" },
          // Units is its own purchasable module (see MODULE_CATALOG), not
          // part of "items" — hence the distinct moduleKey here even though
          // it's nested under the Items group, matching where legacy keeps
          // unit-of-measure setup conceptually.
          { label: "units", href: "units", moduleKey: "units" },
        ],
      },
      {
        key: "reports",
        label: "reports",
        icon: FileBarChart2,
        children: [
          { label: "reports", href: "reports", moduleKey: "reports" },
          // Maskebari is its own paid module in legacy (separate VAT role) —
          // gate these three on "maskebari", not the parent "reports" key.
          { label: "maskebariReport", href: "reports/maskebari", moduleKey: "maskebari" },
          { label: "maskebariReconciliation", href: "reports/maskebari-reconciliation", moduleKey: "maskebari" },
          { label: "partyReconciliation", href: "reports/party-reconciliation", moduleKey: "maskebari" },
          { label: "vatDashboard", href: "reports/vat-dashboard", moduleKey: "reports" },
        ],
      },
      { label: "settings", href: "settings", icon: Settings },
    ],
  },
  // Reciprocal of ACCOUNT_NAV_SECTIONS's "switchToErp" — any company member
  // can already reach /account/* (see account/layout.js, no role gate
  // there), this just makes the trip back visible instead of only living
  // inside the avatar menu's "Account Settings" link.
  {
    key: "account",
    items: [{ label: "switchToAccount", href: "account/dashboard", icon: UserCog }],
  },
];

function readStoredSidebarState() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
}

export default function AppShell({
  children,
  companySlug,
  user,
  organizations,
  activeOrganization,
  accessibleModules = [],
  mode = "erp",
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  // Accordion, not independent toggles: null = no manual choice yet (fall
  // back to whichever group contains the active route), "" = explicitly
  // closed all groups, otherwise the single open group's key.
  const [openGroupKey, setOpenGroupKey] = useState(null);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [themeWaveActive, setThemeWaveActive] = useState(false);
  const [themeWaveOrigin, setThemeWaveOrigin] = useState({ x: 0, y: 0 });
  const [isHeaderSticky, setIsHeaderSticky] = useState(false);
  const themeButtonRef = useRef(null);
  const themeWaveTimerRef = useRef(null);
  const headerRef = useRef(null);
  const headerSentinelRef = useRef(null);
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const pathname = usePathname();
  const navSections = (mode === "account" ? ACCOUNT_NAV_SECTIONS : ERP_NAV_SECTIONS)
    .map((section) => ({
      ...section,
      items: section.items
        .map((item) =>
          item.children
            ? { ...item, children: item.children.filter((child) => !child.moduleKey || accessibleModules.includes(child.moduleKey)) }
            : item
        )
        .filter((item) => (item.children ? item.children.length > 0 : !item.moduleKey || accessibleModules.includes(item.moduleKey))),
    }))
    .filter((section) => section.items.length > 0);
  const compactSidebar = sidebarCollapsed && !sidebarHovered;

  function isNavActive(relativeHref) {
    const href = `/${companySlug}/${relativeHref}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  // Sibling child hrefs can share a prefix (e.g. "parties" and
  // "parties/groups") — isNavActive() alone would light up both for
  // /parties/groups, since it's a prefix match on "parties" too. Only the
  // longest (most specific) matching href among siblings should render as
  // active.
  function bestActiveChildHref(children) {
    return children.reduce((best, child) => {
      if (!isNavActive(child.href)) return best;
      return !best || child.href.length > best.length ? child.href : best;
    }, null);
  }

  function toggleGroup(key, currentlyOpen) {
    setOpenGroupKey(currentlyOpen ? "" : key);
  }

  useEffect(() => {
    // Deliberately not a lazy useState initializer: this must stay a
    // post-mount effect so SSR/first-paint always renders the expanded
    // sidebar (matches the server, which has no localStorage) and only
    // switches to the stored collapsed state after hydration — a lazy
    // initializer would read localStorage during hydration too and could
    // mismatch the server-rendered markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarCollapsed(readStoredSidebarState());
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsHeaderSticky(!entry.isIntersecting);
      },
      { threshold: 0 }
    );

    if (headerSentinelRef.current) {
      observer.observe(headerSentinelRef.current);
    }

    return () => observer.disconnect();
  }, []);

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }

  function triggerThemeWave() {
    if (themeWaveTimerRef.current) {
      window.clearTimeout(themeWaveTimerRef.current);
    }

    const rect = themeButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setThemeWaveOrigin({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }

    setThemeWaveActive(false);
    window.setTimeout(() => setThemeWaveActive(true), 20);
    themeWaveTimerRef.current = window.setTimeout(() => setThemeWaveActive(false), 700);
  }

  return (
    <>
      <div className="min-h-screen bg-muted/30 text-foreground print:min-h-0 print:bg-white print:text-black">
        <div
          className={cn("theme-wave-overlay print:hidden", themeWaveActive && "active")}
          style={{
            "--theme-x": `${themeWaveOrigin.x}px`,
            "--theme-y": `${themeWaveOrigin.y}px`,
          }}
        />
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity lg:hidden print:hidden",
            sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onClick={() => setSidebarOpen(false)}
        />

        <aside
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-card/80 backdrop-blur-sm transition-[width,transform] duration-200 lg:translate-x-0 print:hidden",
            compactSidebar ? "lg:w-20" : "lg:w-72",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className={cn("relative flex h-16 items-center justify-between px-5 transition-all duration-300", compactSidebar && "lg:justify-center lg:px-0")}>
            <div className={cn("overflow-hidden transition-all duration-300 whitespace-nowrap", compactSidebar && "lg:w-7")}>
              <Logo size={30} className={cn("min-w-0")} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute -right-3 top-1/2 -translate-y-1/2 hidden rounded-full bg-background/90 lg:inline-flex active:scale-100"
              onClick={toggleSidebarCollapsed}
              aria-label={compactSidebar ? t("expandSidebar") : t("collapseSidebar")}
              title={compactSidebar ? t("expandSidebar") : t("collapseSidebar")}
            >
              <div className="transition-transform duration-300">
                {compactSidebar ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4 rotate-180" />}
              </div>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label={t("close")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

        

          <nav className={cn("flex-1 space-y-3 overflow-y-auto px-3 py-4", compactSidebar && "lg:px-3")}>
            {navSections.map((section) => (
              <div key={section.key} className="space-y-0.5">
                {section.items.map((item) => {
                  if (item.children) {
                    const activeChildHref = bestActiveChildHref(item.children);
                    const hasActiveChild = activeChildHref !== null;
                    const open = openGroupKey === null ? hasActiveChild : openGroupKey === item.key;
                    const Icon = item.icon;
                    return (
                      <div key={item.key}>
                        <button
                          type="button"
                          onClick={() => toggleGroup(item.key, open)}
                          title={t(item.label)}
                          aria-expanded={open}
                          className={cn(
                            "flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
                            compactSidebar && "lg:justify-center lg:px-3 lg:gap-0",
                            hasActiveChild
                              ? "text-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className={cn(
                            "flex-1 text-left transition-all duration-300 overflow-hidden whitespace-nowrap",
                            compactSidebar && !sidebarHovered && "lg:w-0 lg:ml-0"
                          )}>{t(item.label)}</span>
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                              open && "rotate-90",
                              compactSidebar && "lg:hidden"
                            )}
                          />
                        </button>
                        {open ? (
                          // Icon-rail (compact, unhovered) has no room for children —
                          // lg:hidden here, not a JS-level skip, so the mobile drawer
                          // (which never goes compact) still renders them.
                          <div className={cn("mt-0.5 ml-4.75 space-y-0.5 border-l pl-4", compactSidebar && "lg:hidden")}>
                            {item.children.map((child) => {
                              const childHref = `/${companySlug}/${child.href}`;
                              const childActive = child.href === activeChildHref;
                              return (
                                <Link
                                  key={child.href}
                                  href={childHref}
                                  onClick={() => setSidebarOpen(false)}
                                  title={t(child.label)}
                                  className={cn(
                                    "flex h-7.5 items-center rounded-md px-2.5 text-[13px] transition-colors",
                                    childActive
                                      ? "bg-primary/18 text-foreground font-medium"
                                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                  )}
                                >
                                  {t(child.label)}
                                </Link>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  }

                  const href = `/${companySlug}/${item.href}`;
                  const active = isNavActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={href}
                      onClick={() => setSidebarOpen(false)}
                      title={t(item.label)}
                      className={cn(
                        "flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
                        compactSidebar && "lg:justify-center lg:px-3 lg:gap-0",
                        active
                          ? "bg-primary/18 text-foreground shadow-[inset_3px_0_0_var(--primary)]"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className={cn(
                        "transition-all duration-300 overflow-hidden whitespace-nowrap",
                        compactSidebar && !sidebarHovered && "lg:w-0 lg:ml-0"
                      )}>{t(item.label)}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className={cn("p-4", compactSidebar && "lg:p-3")}>
            <div className={cn("rounded-2xl bg-muted/60 p-3", compactSidebar && "lg:flex lg:h-10 lg:items-center lg:justify-center lg:p-0")}>
              {compactSidebar && !sidebarHovered ? (
                mode === "account" ? (
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                ) : activeOrganization?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Firebase Storage URL, not a local/optimizable asset
                  <img src={activeOrganization.logoUrl} alt="" className="h-6 w-6 rounded-md object-cover" />
                ) : (
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                )
              ) : mode === "account" ? (
                <div className={cn(
                  "flex items-center gap-2 transition-all duration-300",
                  compactSidebar && "lg:w-auto"
                )}>
                  <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex items-center gap-2 whitespace-nowrap min-w-0">
                    <p className="truncate text-sm font-medium min-w-0">
                      {user.firstName} {user.lastName}
                    </p>
                    <span className="inline-block shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {t(user.role)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className={cn(
                  "flex items-center gap-2 transition-all duration-300",
                  compactSidebar && "lg:w-auto"
                )}>
                  {activeOrganization?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Firebase Storage URL, not a local/optimizable asset
                    <img src={activeOrganization.logoUrl} alt="" className="h-5 w-5 shrink-0 rounded-md object-cover" />
                  ) : (
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <p className="truncate text-sm font-medium min-w-0">{activeOrganization?.name ?? t("activeOrganization")}</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        <div className={cn("flex min-h-screen flex-col transition-[padding] duration-200 print:min-h-0 print:pl-0", sidebarCollapsed ? "lg:pl-20" : "lg:pl-72")}>
          <div ref={headerSentinelRef} className="h-0 w-full" />
          <header
            ref={headerRef}
            className={cn(
              "sticky top-0 z-30 px-4 md:px-6 transition-all duration-300 ease-out print:hidden",
              isHeaderSticky ? "border-b bg-background/50 backdrop-blur-xl" : "bg-transparent"
            )}
          >
            <div className={cn(
              "flex items-center gap-3 transition-all duration-300 ease-out",
              isHeaderSticky ? "h-16 py-0" : "h-12 rounded-full bg-card/80 px-3 backdrop-blur-xl md:px-4 my-3"
            )}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label={t("menu")}
              >
                <Menu className="h-4 w-4" />
              </Button>

              <div className={cn(
                "flex w-full max-w-70 min-w-0 items-center px-3 text-sm text-muted-foreground backdrop-blur-sm transition-all duration-300 ease-out",
                isHeaderSticky
                  ? "h-9 rounded-lg border bg-background/60"
                  : "h-8 rounded-full bg-muted/45"
              )}>
                <Search className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{t("searchPlaceholder")}</span>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {mode !== "account" && <ReportPeriodPicker />}
                <div className="relative">
                  <button
                    ref={themeButtonRef}
                    type="button"
                    onClick={() => {
                      setThemeMenuOpen((open) => !open);
                      setUserMenuOpen(false);
                    }}
                    className={cn(
                      "theme-wave-btn relative grid place-items-center transition-all duration-300 ease-out",
                      isHeaderSticky
                        ? "h-9 w-9 rounded-lg border bg-background hover:bg-muted"
                        : "h-8 w-8 rounded-full bg-muted/45 text-muted-foreground hover:bg-muted hover:text-foreground",
                      themeWaveActive && "theme-wave-animating"
                    )}
                    aria-label={t("theme")}
                    aria-expanded={themeMenuOpen}
                    title={t("theme")}
                  >
                    <span className="relative z-10">
                      {theme === "light" ? (
                        <Sun className="h-4 w-4" />
                      ) : theme === "dark" ? (
                        <Moon className="h-4 w-4" />
                      ) : (
                        <Monitor className="h-4 w-4" />
                      )}
                    </span>
                  </button>
                  {themeMenuOpen ? (
                    <div className="absolute right-0 top-12 z-50 w-44 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150">
                      {[
                        ["light", Sun],
                        ["dark", Moon],
                        ["system", Monitor],
                      ].map(([value, Icon]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setTheme(value);
                            setThemeMenuOpen(false);
                          }}
                          className={cn(
                            "flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors hover:bg-muted",
                            theme === value && "bg-muted font-medium"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {t(value)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <LanguageSwitcher
                  className={cn(
                    "transition-all duration-300 ease-out",
                    isHeaderSticky ? "rounded-lg border bg-background/60" : "bg-muted/45"
                  )}
                />
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen((open) => !open);
                    setThemeMenuOpen(false);
                  }}
                  className={cn(
                    "grid place-items-center transition-all duration-300 ease-out",
                    isHeaderSticky
                      ? "h-9 w-9 rounded-lg border bg-background hover:bg-muted"
                      : "h-8 w-8 rounded-full bg-muted/45 hover:bg-muted"
                  )}
                  aria-label={t("accountSettings")}
                  aria-expanded={userMenuOpen}
                  title={t("accountSettings")}
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-xs font-semibold text-primary">
                    {(user.firstName?.[0] ?? user.email?.[0] ?? "U").toUpperCase()}
                  </span>
                </button>
                {userMenuOpen ? (
                  <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-border/60 bg-popover p-1 text-popover-foreground shadow-sm animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150">
                    <div className="border-b px-3 py-3">
                      <p className="truncate text-sm font-medium">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <Link
                      href={`/${companySlug}/account/settings`}
                      onClick={() => setUserMenuOpen(false)}
                      className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm transition-colors hover:bg-muted"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      {t("accountSettings")}
                    </Link>
                    <Link
                      href="/logout"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <LogOut className="h-4 w-4" />
                      {t("logout")}
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <main className="w-full flex-1 px-4 py-6 md:px-6 print:p-0">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
          <div className="print:hidden">
            <Footer />
          </div>
        </div>
      </div>
    </>
  );
}
