import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Picks the Nepali machine-translated value for free-text DB content
 * (organization name/address, etc.) when the app is in Nepali mode and a
 * translation exists — falls back to the English value otherwise (no
 * translation yet, translation failed at write time, or language is "en").
 * `language` is "en" | "ne", from useTranslation()'s i18n.resolvedLanguage
 * (client) or getServerLanguage() (Server Components).
 */
export function pickLocalized(language, enValue, neValue) {
  return language === "ne" && neValue ? neValue : enValue;
}

/**
 * MySQL returns DECIMAL columns as strings at their full defined scale
 * (e.g. decimal(14,5) -> "12.00000"), which is exactly what you want for
 * storage but not for an editable form field — nobody typing a price wants
 * to see "12.00000" when they meant "12". Strips the trailing precision
 * back down to the shortest exact representation ("12.00000" -> "12",
 * "12.50000" -> "12.5") for populating a controlled <input>'s initial
 * value. Display-only — never use this for arithmetic (see ../../AGENTS.md
 * §5); the actual save path re-parses and re-applies fixed precision
 * server-side regardless of what this produces.
 */
export function decimalToInputValue(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? String(number) : "0";
}
