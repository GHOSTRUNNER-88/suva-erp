import {
  CircleDollarSign,
  FileBarChart2,
  FileText,
  Landmark,
  NotebookText,
  Package,
  ReceiptText,
  Ruler,
  ShieldCheck,
  Users,
} from "lucide-react";

/**
 * The ERP's module catalog — what the Module Store sells and what an
 * Organization can turn on for itself (a subset of what the Company has
 * purchased). `built: true` means the module actually has a working UI
 * today (Units, Parties, Items so far) — everything else is purchasable now
 * so the entitlement data is ready, and gets real functionality "one by
 * one" (see HANDOFF.md).
 *
 * `default: true` modules are bundled with every Company automatically —
 * seeded into `companies.purchasedModules` at signup and into every new
 * Organization's `enabledModules` at creation (see create-company.js /
 * createOrganizationAction) — the Module Store shows them as "Included"
 * rather than something to purchase. Payroll and Maskebari are the only
 * paid add-ons, matching the legacy app's separate Payroll Manager / VAT
 * roles. Inventory is not a separate module here — "Items" covers item
 * masters and stock tracking together, per how the business actually uses
 * them (legacy's `masters` nav category bundles Items + Inventory too).
 */
export const MODULE_CATALOG = [
  { key: "sales", labelKey: "sales", icon: ReceiptText, built: false, default: true },
  { key: "purchase", labelKey: "purchase", icon: FileText, built: false, default: true },
  { key: "finance", labelKey: "finance", icon: CircleDollarSign, built: false, default: true },
  { key: "cashBank", labelKey: "cashBank", icon: Landmark, built: true, default: true },
  { key: "parties", labelKey: "parties", icon: ShieldCheck, built: true, default: true },
  { key: "items", labelKey: "items", icon: Package, built: true, default: true },
  { key: "units", labelKey: "units", icon: Ruler, built: true, default: true },
  { key: "reports", labelKey: "reports", icon: FileBarChart2, built: false, default: true },
  { key: "payroll", labelKey: "payroll", icon: Users, built: false, default: false },
  { key: "maskebari", labelKey: "maskebari", icon: NotebookText, built: false, default: false },
];

export const MODULE_KEYS = MODULE_CATALOG.map((module) => module.key);
export const DEFAULT_MODULE_KEYS = MODULE_CATALOG.filter((module) => module.default).map((module) => module.key);

export function parseModuleList(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((key) => MODULE_KEYS.includes(key)) : [];
  } catch {
    return [];
  }
}
