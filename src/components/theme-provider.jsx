"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Suva is light-mode only (redesign2/ui.md #46 — no dark mode, no system
// mode, no theme toggle). `forcedTheme` keeps next-themes' `useTheme()` API
// intact for the two other real consumers (dual-date-field.jsx's Nepali
// datepicker widget, toaster.jsx's Sonner theme prop) without either of
// them needing to change — it just always resolves to "light" regardless of
// OS preference or any previously stored value, and no UI anywhere offers a
// way to change it.
export function ThemeProvider({ children }) {
  return (
    <NextThemesProvider attribute="class" forcedTheme="light" storageKey="suva-theme">
      {children}
    </NextThemesProvider>
  );
}
