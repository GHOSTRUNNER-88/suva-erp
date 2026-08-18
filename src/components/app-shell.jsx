"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { pageVariants, pageTransition } from "@/lib/motion";
import { useTranslation } from "react-i18next";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { ReportPeriodPicker } from "@/components/report-period-picker";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { CommandMenu } from "@/components/command-menu";
import { QuickCreate } from "@/components/quick-create";
import { Breadcrumb } from "@/components/breadcrumb";
import { ACCOUNT_NAV_SECTIONS, ERP_NAV_SECTIONS } from "@/lib/nav-sections";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "suva-sidebar-collapsed";

function readStoredSidebarState() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
}

// Every sidebar icon sits in this same small rounded container — tinted
// gold only on the active row, neutral otherwise. One shared shape so the
// whole nav reads as one system (see redesign2.md's sidebar direction:
// "gold icon" accent, never a full-row fill) instead of bare icons floating
// in a text row.
function NavIcon({ icon: Icon, active }) {
  return (
    <span
      className={cn(
        "grid h-6.5 w-6.5 shrink-0 place-items-center rounded-md transition-colors",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
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

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-muted/25 text-foreground print:min-h-0 print:bg-white print:text-black">
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity lg:hidden print:hidden",
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setSidebarOpen(false)}
      />

      {/* SIDEBAR — 240px expanded / 64px collapsed, hover-expands when
          collapsed. Deliberately no full-row gold fill anywhere (see
          NavIcon + the active-state classes below): a tinted icon square
          for top-level items, a thin left rail for nested children. */}
      <aside
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border/60 bg-card transition-[width,transform] duration-200 lg:translate-x-0 print:hidden",
          compactSidebar ? "lg:w-16" : "lg:w-60",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className={cn("relative flex h-14 items-center justify-between px-4", compactSidebar && "lg:justify-center lg:px-0")}>
          <div className={cn("overflow-hidden whitespace-nowrap transition-all duration-300", compactSidebar && "lg:w-7")}>
            <Logo size={26} className="min-w-0" />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute -right-3 top-1/2 hidden -translate-y-1/2 rounded-full border bg-background lg:inline-flex active:scale-100"
            onClick={toggleSidebarCollapsed}
            aria-label={compactSidebar ? t("expandSidebar") : t("collapseSidebar")}
            title={compactSidebar ? t("expandSidebar") : t("collapseSidebar")}
          >
            <div className="transition-transform duration-300">
              {compactSidebar ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4 rotate-180" />}
            </div>
          </Button>
          <Button type="button" variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)} aria-label={t("close")}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className={cn("flex-1 space-y-4 overflow-y-auto px-2.5 py-3", compactSidebar && "lg:px-2.5")}>
          {navSections.map((section) => (
            <div key={section.key} className="space-y-0.5">
              {section.heading && !compactSidebar && (
                <p className="px-2.5 pb-1 text-[10.5px] font-semibold tracking-wider text-muted-foreground/65 uppercase">{t(section.heading)}</p>
              )}
              {section.items.map((item) => {
                if (item.children) {
                  const activeChildHref = bestActiveChildHref(item.children);
                  const hasActiveChild = activeChildHref !== null;
                  const open = openGroupKey === null ? hasActiveChild : openGroupKey === item.key;
                  return (
                    <div key={item.key}>
                      <button
                        type="button"
                        onClick={() => toggleGroup(item.key, open)}
                        title={t(item.label)}
                        aria-expanded={open}
                        className={cn(
                          "flex h-8.5 w-full items-center gap-2 rounded-lg px-1.5 text-[13px] transition-colors",
                          compactSidebar && "lg:justify-center lg:px-1.5 lg:gap-0",
                          hasActiveChild ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <NavIcon icon={item.icon} active={hasActiveChild} />
                        <span
                          className={cn(
                            "flex-1 overflow-hidden text-left whitespace-nowrap transition-all duration-300",
                            compactSidebar && !sidebarHovered && "lg:w-0 lg:ml-0"
                          )}
                        >
                          {t(item.label)}
                        </span>
                        <ChevronRight
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200",
                            open && "rotate-90",
                            compactSidebar && "lg:hidden"
                          )}
                        />
                      </button>
                      {open ? (
                        // Icon-rail (compact, unhovered) has no room for children —
                        // lg:hidden here, not a JS-level skip, so the mobile drawer
                        // (which never goes compact) still renders them.
                        <div className={cn("mt-0.5 ml-7.5 space-y-0.5", compactSidebar && "lg:hidden")}>
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
                                  "flex h-7.5 items-center border-l-2 pl-3 text-[13px] transition-colors",
                                  childActive
                                    ? "border-primary font-medium text-foreground"
                                    : "border-border/70 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
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
                return (
                  <Link
                    key={item.href}
                    href={href}
                    onClick={() => setSidebarOpen(false)}
                    title={t(item.label)}
                    className={cn(
                      "flex h-8.5 items-center gap-2 rounded-lg px-1.5 text-[13px] transition-colors",
                      compactSidebar && "lg:justify-center lg:px-1.5 lg:gap-0",
                      active ? "bg-muted/70 font-semibold text-foreground" : "font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                  >
                    <NavIcon icon={item.icon} active={active} />
                    <span
                      className={cn(
                        "overflow-hidden whitespace-nowrap transition-all duration-300",
                        compactSidebar && !sidebarHovered && "lg:w-0 lg:ml-0"
                      )}
                    >
                      {t(item.label)}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={cn("border-t border-border/60 p-3", compactSidebar && "lg:p-2.5")}>
          <div className={cn("rounded-xl bg-muted/50 p-2.5", compactSidebar && "lg:flex lg:h-9 lg:items-center lg:justify-center lg:p-0")}>
            {compactSidebar && !sidebarHovered ? (
              mode === "account" ? (
                <UserRound className="h-4 w-4 text-muted-foreground" />
              ) : activeOrganization?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- Firebase Storage URL, not a local/optimizable asset
                <img src={activeOrganization.logoUrl} alt="" className="h-5.5 w-5.5 rounded-md object-cover" />
              ) : (
                <Building2 className="h-4 w-4 text-muted-foreground" />
              )
            ) : mode === "account" ? (
              <div className={cn("flex items-center gap-2 transition-all duration-300", compactSidebar && "lg:w-auto")}>
                <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                  <p className="min-w-0 truncate text-[13px] font-medium">
                    {user.firstName} {user.lastName}
                  </p>
                  <span className="inline-block shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10.5px] font-semibold text-primary">
                    {t(user.role)}
                  </span>
                </div>
              </div>
            ) : (
              <div className={cn("flex items-center gap-2 transition-all duration-300", compactSidebar && "lg:w-auto")}>
                {activeOrganization?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Firebase Storage URL, not a local/optimizable asset
                  <img src={activeOrganization.logoUrl} alt="" className="h-5 w-5 shrink-0 rounded-md object-cover" />
                ) : (
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <p className="min-w-0 truncate text-[13px] font-medium">{activeOrganization?.name ?? t("activeOrganization")}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* MAIN COLUMN — the topbar is a single static, docked bar (no
          floating-pill scroll morph) so it reads as part of the application
          frame instead of a widget hovering over it. */}
      <div className={cn("flex min-h-screen flex-col transition-[padding] duration-200 print:min-h-0 print:pl-0", sidebarCollapsed ? "lg:pl-16" : "lg:pl-60")}>
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur-md print:hidden">
          <div className="flex h-14 items-center gap-3 px-4 md:px-6">
            <Button type="button" variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label={t("menu")}>
              <Menu className="h-4 w-4" />
            </Button>

            <Breadcrumb companySlug={companySlug} mode={mode} />

            <div className="ml-auto flex min-w-0 items-center gap-2">
              <div className="hidden w-72 shrink-0 sm:block">
                <CommandMenu
                  companySlug={companySlug}
                  accessibleModules={accessibleModules}
                  triggerClassName="h-9 rounded-lg border border-border/70 bg-muted/35 hover:bg-muted/60"
                />
              </div>
              {mode !== "account" && <QuickCreate companySlug={companySlug} accessibleModules={accessibleModules} />}
              {mode !== "account" && <ReportPeriodPicker />}
              <div className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" />

              <LanguageSwitcher className="rounded-lg border border-border/70" />

              <div className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" />

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((open) => !open)}
                  className="flex h-9 items-center gap-2 rounded-lg border border-border/70 py-1 pr-2 pl-1 transition-colors hover:bg-muted xl:pl-1.5"
                  aria-label={t("accountSettings")}
                  aria-expanded={userMenuOpen}
                  title={t("accountSettings")}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/15 text-xs font-semibold text-primary">
                    {(user.firstName?.[0] ?? user.email?.[0] ?? "U").toUpperCase()}
                  </span>
                  <span className="hidden min-w-0 flex-col items-start leading-tight xl:flex">
                    <span className="max-w-32 truncate text-xs font-medium text-foreground">
                      {user.firstName} {user.lastName}
                    </span>
                    {user.role && <span className="max-w-32 truncate text-[11px] text-muted-foreground">{t(user.role)}</span>}
                  </span>
                  <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground xl:block" />
                </button>
                {userMenuOpen ? (
                  <div className="absolute top-11 right-0 z-50 w-64 overflow-hidden rounded-2xl border border-border/60 bg-popover p-1 text-popover-foreground shadow-sm animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150">
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
          </div>
        </header>

        <main className="w-full flex-1 px-4 py-5 md:px-6 print:p-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
