import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { resources } from "@/lib/i18n-resources";

// Client-only instance (react-i18next). Server Components must use
// getServerT() from "@/lib/i18n-server" instead — importing this file's
// react-i18next dependency from a Server Component breaks the RSC bundle
// (see the comment in i18n-resources.js for why).
const i18n = i18next.createInstance();

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18n;
