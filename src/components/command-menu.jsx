"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  CircleDollarSign,
  CornerDownLeft,
  FileBarChart2,
  FileText,
  Landmark,
  LayoutDashboard,
  Package,
  ReceiptText,
  Ruler,
  Search,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { QUICK_CREATE_ITEMS } from "@/lib/quick-create-items";
import { cn } from "@/lib/utils";

// "Navigate" group — deliberately distinct from app-shell.jsx's
// ERP_NAV_SECTIONS: the sidebar groups Sales/Purchase/etc. as expandable
// parents with no page of their own, but a command palette result has to be
// a single Enter-key destination, so this flattens straight to each leaf
// page instead. moduleKey gating matches the sidebar's own accessibleModules
// check (see redesign.md's "only expose actions the current user is
// authorized to access").
const NAVIGATE_ITEMS = [
  { labelKey: "erpDashboard", href: "dashboard", icon: LayoutDashboard },
  { labelKey: "salesInvoices", href: "sales/invoices", icon: ReceiptText, moduleKey: "sales" },
  { labelKey: "salesOrders", href: "sales/orders", icon: ReceiptText, moduleKey: "sales" },
  { labelKey: "quotations", href: "sales/quotations", icon: ReceiptText, moduleKey: "sales" },
  { labelKey: "creditNotes", href: "sales/credit-notes", icon: ReceiptText, moduleKey: "sales" },
  { labelKey: "deliveryChallans", href: "sales/delivery-challans", icon: ReceiptText, moduleKey: "sales" },
  { labelKey: "purchaseBills", href: "purchase/bills", icon: FileText, moduleKey: "purchase" },
  { labelKey: "purchaseOrders", href: "purchase/orders", icon: FileText, moduleKey: "purchase" },
  { labelKey: "expenses", href: "purchase/expenses", icon: FileText, moduleKey: "purchase" },
  { labelKey: "debitNotes", href: "purchase/debit-notes", icon: FileText, moduleKey: "purchase" },
  { labelKey: "paymentIn", href: "finance/payment-in", icon: CircleDollarSign, moduleKey: "finance" },
  { labelKey: "paymentOut", href: "finance/payment-out", icon: CircleDollarSign, moduleKey: "finance" },
  { labelKey: "chequeRegister", href: "finance/cheque-register", icon: CircleDollarSign, moduleKey: "finance" },
  { labelKey: "cashBank", href: "bank-accounts", icon: Landmark, moduleKey: "cashBank" },
  { labelKey: "parties", href: "parties", icon: ShieldCheck, moduleKey: "parties" },
  { labelKey: "items", href: "items", icon: Package, moduleKey: "items" },
  { labelKey: "inventory", href: "items/inventory", icon: Package, moduleKey: "items" },
  { labelKey: "warehouses", href: "items/warehouses", icon: Package, moduleKey: "items" },
  { labelKey: "units", href: "units", icon: Ruler, moduleKey: "units" },
  { labelKey: "reports", href: "reports", icon: FileBarChart2, moduleKey: "reports" },
  { labelKey: "settings", href: "settings", icon: Settings },
];

/**
 * Ctrl/Cmd+K global command palette — navigation + quick-create actions,
 * both permission/module-gated the same way the sidebar is. Self-contained:
 * owns its own open state and the global keydown listener, so app-shell.jsx
 * only needs to render `<CommandMenu companySlug={...} accessibleModules={...} />`
 * once. Search is client-side substring matching over static, already-loaded
 * label lists — no server round trip, so there's nothing to debounce.
 */
export function CommandMenu({ companySlug, accessibleModules = [], triggerClassName }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const navigateResults = useMemo(
    () =>
      NAVIGATE_ITEMS.filter((item) => !item.moduleKey || accessibleModules.includes(item.moduleKey)).filter((item) =>
        t(item.labelKey).toLowerCase().includes(query.trim().toLowerCase())
      ),
    [accessibleModules, query, t]
  );

  const actionResults = useMemo(
    () =>
      QUICK_CREATE_ITEMS.filter((item) => !item.moduleKey || accessibleModules.includes(item.moduleKey)).filter((item) =>
        t(item.labelKey).toLowerCase().includes(query.trim().toLowerCase())
      ),
    [accessibleModules, query, t]
  );

  const flatResults = useMemo(
    () => [
      ...navigateResults.map((item) => ({ ...item, type: "navigate" })),
      ...actionResults.map((item) => ({ ...item, type: "action" })),
    ],
    [navigateResults, actionResults]
  );

  function close() {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }

  function go(item) {
    router.push(`/${companySlug}/${item.href}`);
    close();
  }

  useEffect(() => {
    function handleKeyDown(event) {
      const isCombo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isCombo) {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (event.key === "Escape" && open) {
        close();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function handleQueryChange(event) {
    setQuery(event.target.value);
    setActiveIndex(0);
  }

  function handleInputKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, flatResults.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = flatResults[activeIndex];
      if (item) go(item);
    }
  }

  if (!open || typeof document === "undefined") {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("openCommandPalette")}
        className={cn(
          "flex h-8 w-full items-center rounded-full bg-muted/45 px-3 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-muted",
          triggerClassName
        )}
      >
        <Search className="mr-2 h-4 w-4 shrink-0" />
        <span className="truncate">{t("searchPlaceholder")}</span>
        <kbd className="ml-auto hidden shrink-0 items-center gap-0.5 rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
          Ctrl K
        </kbd>
      </button>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-start justify-center px-4 pt-[12vh]">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150"
      >
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleInputKeyDown}
            placeholder={t("commandPalettePlaceholder")}
            className="h-12 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 items-center rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
            Esc
          </kbd>
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {flatResults.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t("noResults")}</p>
          ) : (
            <>
              {navigateResults.length > 0 && (
                <CommandGroup label={t("commandGroupNavigate")}>
                  {navigateResults.map((item, index) => (
                    <CommandRow
                      key={item.href}
                      item={item}
                      label={t(item.labelKey)}
                      active={index === activeIndex}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => go(item)}
                    />
                  ))}
                </CommandGroup>
              )}
              {actionResults.length > 0 && (
                <CommandGroup label={t("commandGroupActions")}>
                  {actionResults.map((item, index) => {
                    const globalIndex = navigateResults.length + index;
                    return (
                      <CommandRow
                        key={item.key}
                        item={item}
                        label={t(item.labelKey)}
                        active={globalIndex === activeIndex}
                        onMouseEnter={() => setActiveIndex(globalIndex)}
                        onClick={() => go(item)}
                      />
                    );
                  })}
                </CommandGroup>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function CommandGroup({ label, children }) {
  return (
    <div className="mb-1 last:mb-0">
      <p className="px-3 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function CommandRow({ item, label, active, onMouseEnter, onClick }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm transition-colors",
        active ? "bg-primary/12 text-foreground" : "text-foreground hover:bg-muted"
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
    </button>
  );
}
