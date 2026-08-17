"use client";

import { useTheme } from "next-themes";
import { Toaster as SonnerToaster } from "sonner";

/**
 * Mounted once in the root layout (see layout.js). Colors use bg-popover /
 * text-popover-foreground — same theme-aware tokens the dropdown menus in
 * app-shell.jsx use — never a fixed-in-one-theme color like bg-foreground,
 * which inverts under .dark and was already a real bug once this session.
 */
export function Toaster() {
  const { theme } = useTheme();

  return (
    <SonnerToaster
      theme={theme ?? "system"}
      position="bottom-right"
      duration={4000}
      closeButton
      toastOptions={{
        classNames: {
          toast: "rounded-xl border bg-popover text-popover-foreground shadow-lg",
          title: "text-sm font-medium",
          description: "text-sm text-muted-foreground",
          closeButton: "bg-background border-border text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-muted text-muted-foreground",
        },
      }}
    />
  );
}
