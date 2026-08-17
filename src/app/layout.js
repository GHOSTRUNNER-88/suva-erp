import { Noto_Sans_Devanagari, Poppins } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/components/i18n-provider";
import { Toaster } from "@/components/toaster";
import "./globals.css";

// Named --font-sans (not --font-poppins) because globals.css's Tailwind
// theme reads `--font-sans` directly — using any other variable name here
// silently breaks `font-sans` across the whole app with no visible error,
// which is exactly what happened with the previous Geist setup.
const poppins = Poppins({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Poppins has no Devanagari glyphs at all, so Nepali text was silently
// falling back to whatever generic font the OS picked. globals.css applies
// this via a `:lang(ne)` rule wherever document.documentElement.lang="ne".
const notoSansDevanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  title: {
    default: "Suva ERP",
    template: "%s · Suva ERP",
  },
  description: "Suva ERP — accounting and business management.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${notoSansDevanagari.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <I18nProvider>
          <ThemeProvider>
            {children}
            <Toaster />
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
