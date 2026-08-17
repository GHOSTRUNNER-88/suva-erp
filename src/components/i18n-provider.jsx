"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n";

const STORAGE_KEY = "suva-language";
const VALID_LANGUAGES = new Set(["en", "ne"]);

/**
 * Mounted once in the root layout so every page — including pre-auth
 * screens like /login and /signup that never render AppShell — can call
 * useTranslation() and get a language that's actually persisted and
 * consistent app-wide. Previously the language toggle only existed inside
 * AppShell, so anything outside it (login, signup) had no way to switch
 * languages at all.
 */
export function I18nProvider({ children }) {
  const router = useRouter();

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial = VALID_LANGUAGES.has(stored) ? stored : "en";
    if (initial !== i18n.language) {
      i18n.changeLanguage(initial);
    }
    document.documentElement.lang = initial;

    function handleLanguageChanged(lng) {
      window.localStorage.setItem(STORAGE_KEY, lng);
      document.documentElement.lang = lng;
      // Mirrored into a cookie (not just localStorage) so Server Components
      // — which can't read localStorage — can render already-translated
      // HTML via getServerT() instead of always defaulting to English.
      document.cookie = `${STORAGE_KEY}=${lng}; path=/; max-age=31536000; SameSite=Lax`;
      // useTranslation() consumers (client components) re-render on their
      // own when the instance's language changes — but anything rendered
      // via getServerT() (Server Components: account dashboard,
      // organizations, settings, ...) was already sent as plain HTML and
      // has no client-side hook to react to this. Without refreshing,
      // switching languages only updates client-rendered chrome and every
      // Server Component page stays stale until the user manually reloads
      // — router.refresh() re-fetches the current route's Server Component
      // payload (now reading the cookie we just set) without a full page
      // reload or losing client-side state.
      router.refresh();
    }
    i18n.on("languageChanged", handleLanguageChanged);
    return () => i18n.off("languageChanged", handleLanguageChanged);
  }, [router]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
