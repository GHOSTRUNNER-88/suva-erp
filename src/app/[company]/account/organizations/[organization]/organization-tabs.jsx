import Link from "next/link";
import { Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getServerT } from "@/lib/i18n-server";

// No "Overview" tab — that standalone page was removed; overview info now
// only lives in the Organizations list's split-view panel (see
// organizations-split-view.jsx). Users/Settings keep their own routes.
const TABS = [
  { key: "users", labelKey: "users", icon: Users, segment: "users" },
  { key: "settings", labelKey: "settings", icon: Settings, segment: "settings" },
];

export async function OrganizationTabs({ companySlug, organizationId, active }) {
  const t = await getServerT();
  return (
    <div className="overflow-x-auto border-b bg-muted/30">
      <nav className="flex min-w-max gap-1 px-5 py-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const href = `/${companySlug}/account/organizations/${organizationId}${
            tab.segment ? `/${tab.segment}` : ""
          }`;
          return (
            <Link
              key={tab.key}
              href={href}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                active === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {t(tab.labelKey)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
