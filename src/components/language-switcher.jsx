"use client";

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "ne", label: "ने" },
];

/**
 * The one EN/ने toggle used everywhere — sidebar/topbar (AppShell) and the
 * pre-auth login/signup cards alike. Previously this pill only existed
 * inline inside AppShell, so screens outside it had no switcher at all.
 */
export function LanguageSwitcher({ className, pill = true }) {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage?.startsWith("ne") ? "ne" : "en";

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full bg-muted/60 p-1 backdrop-blur-sm",
        !pill && "bg-transparent p-0",
        className
      )}
      aria-label={t("language")}
    >
      {LANGUAGES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => i18n.changeLanguage(code)}
          className={cn(
            "flex h-7 min-w-8 items-center justify-center rounded-full px-2.5 text-[11px] font-semibold tracking-wide transition-all duration-200",
            current === code
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
