import { cookies } from "next/headers";
import i18next from "i18next";
import { resources } from "@/lib/i18n-resources";

const VALID_LANGUAGES = new Set(["en", "ne"]);

// Deliberately plain i18next core, NOT react-i18next and NOT the shared
// client instance in "@/lib/i18n" — that one pulls in react-i18next, whose
// context-creation code crashes Next's RSC bundle ("createContext is not a
// function") the moment any Server Component transitively imports it. This
// instance never calls changeLanguage(); getFixedT(lang) is a pure lookup
// against the already-loaded resources, so reusing one instance across
// concurrent requests is safe — each request's language never touches
// shared state.
let serverI18n;
function getServerI18nInstance() {
  if (!serverI18n) {
    serverI18n = i18next.createInstance();
    serverI18n.init({
      resources,
      lng: "en",
      fallbackLng: "en",
      interpolation: { escapeValue: false },
      returnNull: false,
      initImmediate: false,
    });
  }
  return serverI18n;
}

/**
 * Server Component equivalent of `useTranslation()` — those pages fetch
 * data async and can't use client hooks. Reads the same `suva-language`
 * cookie `I18nProvider` writes on the client, so the very first
 * server-rendered HTML is already in the right language — no flash of
 * English before hydration, unlike the client-only pages.
 */
export async function getServerT() {
  const lang = await getServerLanguage();
  return getServerI18nInstance().getFixedT(lang);
}

/**
 * Just the language code, for code that needs to pick between an English
 * and Nepali DB value (see pickLocalized() in "@/lib/utils") rather than
 * translate a UI label.
 */
export async function getServerLanguage() {
  const cookieStore = await cookies();
  const stored = cookieStore.get("suva-language")?.value;
  return VALID_LANGUAGES.has(stored) ? stored : "en";
}
