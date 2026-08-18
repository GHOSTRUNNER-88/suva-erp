import {
  Building2,
  CircleDollarSign,
  FileBarChart2,
  FileText,
  Landmark,
  LayoutDashboard,
  Package,
  ReceiptText,
  Settings,
  ShieldCheck,
  Store,
  UserCog,
  Users,
} from "lucide-react";

// Shared by app-shell.jsx (sidebar rendering) and breadcrumb.jsx (deriving
// "Section / Page" from the current pathname) — extracted so the two never
// disagree about what a route is called. See app-shell.jsx's original
// comment block for the moduleKey/children gating rules; unchanged here.
export const ACCOUNT_NAV_SECTIONS = [
  {
    key: "account",
    items: [
      { label: "accountDashboard", href: "account/dashboard", icon: UserCog },
      { label: "organizations", href: "account/organizations", icon: Building2 },
      { label: "moduleStore", href: "account/modules", icon: Store },
    ],
  },
  {
    key: "workspace",
    items: [{ label: "switchToErp", href: "dashboard", icon: LayoutDashboard }],
  },
];

export const ERP_NAV_SECTIONS = [
  {
    key: "workspace",
    items: [{ label: "erpDashboard", href: "dashboard", icon: LayoutDashboard }],
  },
  {
    key: "operations",
    heading: "navOperations",
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
    heading: "navMasters",
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
          { label: "units", href: "units", moduleKey: "units" },
        ],
      },
      {
        key: "reports",
        label: "reports",
        icon: FileBarChart2,
        children: [
          { label: "reports", href: "reports", moduleKey: "reports" },
          { label: "maskebariReport", href: "reports/maskebari", moduleKey: "maskebari" },
          { label: "maskebariReconciliation", href: "reports/maskebari-reconciliation", moduleKey: "maskebari" },
          { label: "partyReconciliation", href: "reports/party-reconciliation", moduleKey: "maskebari" },
          { label: "vatDashboard", href: "reports/vat-dashboard", moduleKey: "reports" },
        ],
      },
      { label: "settings", href: "settings", icon: Settings },
    ],
  },
  {
    key: "account",
    items: [{ label: "switchToAccount", href: "account/dashboard", icon: UserCog }],
  },
];
