"use client";

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** One shared footer, mounted in AppShell (every account/ERP page) and the standalone auth/setup pages. */
export function Footer({ className }) {
  const { t } = useTranslation();
  return (
    <footer className={cn("px-4 py-4 text-center text-xs text-muted-foreground md:px-6", className)}>
      {t("footerMadeBy")}
    </footer>
  );
}
