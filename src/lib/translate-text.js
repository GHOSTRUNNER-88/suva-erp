const MYMEMORY_ENDPOINT = "https://api.mymemory.translated.net/get";

/**
 * Machine-translates free text to Nepali via MyMemory's free translation
 * API (no API key required — the user explicitly chose "no external
 * service credentials" scope for this). Called at WRITE time only
 * (createOrganizationAction / updateOrganizationAction), never on page
 * read — translating live on every request would mean every page load
 * depends on a third-party API's uptime and latency, which is not
 * acceptable for core organization data in an ERP.
 *
 * Never throws: any failure (network, rate limit, empty input) returns
 * null, and callers fall back to displaying the English value rather than
 * leaving a field blank or breaking the save.
 */
export async function translateToNepali(text) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = `${MYMEMORY_ENDPOINT}?q=${encodeURIComponent(trimmed)}&langpair=en|ne`;
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const translated = data?.responseData?.translatedText;
    return typeof translated === "string" && translated.trim() && translated.trim() !== trimmed
      ? translated.trim()
      : null;
  } catch (error) {
    console.error("[translate] MyMemory request failed", error);
    return null;
  }
}
