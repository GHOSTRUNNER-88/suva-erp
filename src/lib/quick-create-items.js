import { CircleDollarSign, FileText, Package, ReceiptText, ShieldCheck } from "lucide-react";

// Shared by the topbar "+ Create" menu (components/quick-create.jsx) and the
// Cmd/Ctrl+K command palette's Actions group (components/command-menu.jsx) —
// one source of truth so the two entry points never drift. `href` is
// relative to `/{companySlug}/`; entities with no dedicated create route
// (Party, Item — see items-view.jsx/parties-view.jsx) link to their list
// page, where creation happens inline via a Sheet, rather than a fake deep
// link into a create mode that doesn't exist as a URL.
export const QUICK_CREATE_ITEMS = [
  { key: "salesInvoice", labelKey: "qcNewSalesInvoice", href: "sales/invoices/new", moduleKey: "sales", icon: ReceiptText },
  { key: "salesOrder", labelKey: "qcNewSalesOrder", href: "sales/orders/new", moduleKey: "sales", icon: ReceiptText },
  { key: "quotation", labelKey: "qcNewQuotation", href: "sales/quotations/new", moduleKey: "sales", icon: ReceiptText },
  { key: "purchaseBill", labelKey: "qcNewPurchaseBill", href: "purchase/bills/new", moduleKey: "purchase", icon: FileText },
  { key: "purchaseOrder", labelKey: "qcNewPurchaseOrder", href: "purchase/orders/new", moduleKey: "purchase", icon: FileText },
  { key: "paymentIn", labelKey: "qcNewPaymentIn", href: "finance/payment-in", moduleKey: "finance", icon: CircleDollarSign },
  { key: "paymentOut", labelKey: "qcNewPaymentOut", href: "finance/payment-out", moduleKey: "finance", icon: CircleDollarSign },
  { key: "party", labelKey: "qcNewParty", href: "parties", moduleKey: "parties", icon: ShieldCheck },
  { key: "item", labelKey: "qcNewItem", href: "items", moduleKey: "items", icon: Package },
];
