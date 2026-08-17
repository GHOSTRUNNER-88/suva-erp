"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useTranslation } from "react-i18next";
import { Calendar, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DualDateField } from "@/components/dual-date-field";
import { REPORT_PERIOD_COOKIE } from "@/lib/report-period-constants";
import { cn } from "@/lib/utils";

const NEPALI_DATEPICKER_JS_SRC =
  "https://nepalidatepicker.sajanmaharjan.com.np/v5/nepali.datepicker/js/nepali.datepicker.v5.0.6.min.js";
// First fiscal year to list — Shrawan of the BS year whose start falls in
// AD 2024 (per the user's request: "start from every shrawan start from
// 2024"). July 16 is Shrawan 1 in the vast majority of years; only used to
// find the right BS year to begin from, the real per-year math below uses
// the widget's actual BS2AD/AD2BS, not this approximation.
const FISCAL_YEAR_LIST_START_AD = "2024-07-16";

function readCookie(name) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeReportPeriodCookie(range) {
  document.cookie = `${REPORT_PERIOD_COOKIE}=${encodeURIComponent(JSON.stringify(range))}; path=/; max-age=31536000; SameSite=Lax`;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function normalizeToIso(date) {
  if (!date) return null;
  if (typeof date === "string") {
    const match = date.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (!match) return null;
    const [, y, m, d] = match;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (typeof date === "object" && date.year && date.month && date.day) {
    return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  }
  return null;
}

function defaultRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: isoDate(start), to: isoDate(now) };
}

function daysAgoRange(days) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  return { from: isoDate(start), to: isoDate(now) };
}

// key must stay stable (used to highlight the active preset) — label is
// resolved through t() at render time, not stored here.
const PRESETS = [
  { key: "today", labelKey: "periodToday", range: () => daysAgoRange(1) },
  { key: "last7", labelKey: "periodLast7Days", range: () => daysAgoRange(7) },
  { key: "last15", labelKey: "periodLast15Days", range: () => daysAgoRange(15) },
  { key: "last30", labelKey: "periodLast30Days", range: () => daysAgoRange(30) },
  { key: "last45", labelKey: "periodLast45Days", range: () => daysAgoRange(45) },
  { key: "last60", labelKey: "periodLast60Days", range: () => daysAgoRange(60) },
  { key: "monthToDate", labelKey: "periodMonthToDate", range: defaultRange },
];

function rangesEqual(a, b) {
  return a.from === b.from && a.to === b.to;
}

/**
 * Nepal's fiscal year runs Shrawan 1 (BS month 4) through the end of the
 * following Ashadh (BS month 3) — every FY's start/end computed via the
 * widget's real BS2AD, not hand-rolled BS math (AGENTS.md §4: one shared
 * conversion, not per-screen). The current (still-running) FY is capped at
 * today, not projected forward to its actual end.
 */
function computeFiscalYears() {
  const nf = typeof window !== "undefined" ? window.NepaliFunctions : null;
  if (!nf?.AD2BS || !nf?.BS2AD) return [];

  const todayIso = isoDate(new Date());
  const todayBs = nf.AD2BS(todayIso);
  const startBsOfListWindow = nf.AD2BS(FISCAL_YEAR_LIST_START_AD);
  if (!todayBs || !startBsOfListWindow) return [];

  const currentFyStartYear = todayBs.month >= 4 ? todayBs.year : todayBs.year - 1;
  const firstFyStartYear = startBsOfListWindow.month >= 4 ? startBsOfListWindow.year : startBsOfListWindow.year - 1;

  const years = [];
  for (let y = firstFyStartYear; y <= currentFyStartYear; y++) {
    const startAd = normalizeToIso(nf.BS2AD({ year: y, month: 4, day: 1 }));
    if (!startAd) continue;
    const isCurrent = y === currentFyStartYear;
    let endAd = todayIso;
    if (!isCurrent) {
      const nextStartAd = normalizeToIso(nf.BS2AD({ year: y + 1, month: 4, day: 1 }));
      if (nextStartAd) {
        const endDate = new Date(nextStartAd);
        endDate.setDate(endDate.getDate() - 1);
        endAd = isoDate(endDate);
      }
    }
    years.push({ key: `fy-${y}`, label: `${y}/${String((y + 1) % 100).padStart(2, "0")} BS`, from: startAd, to: endAd });
  }
  return years.reverse();
}

/**
 * ERP-header-only control (see app-shell.jsx, right side of the header) —
 * one place to set the reporting date range instead of every report/
 * dashboard page having its own separate filter. Persisted to a cookie
 * (same pattern as the language switcher, see i18n-provider.jsx) so it
 * survives navigation; every report/dashboard reads it back via
 * lib/report-period.js's getReportPeriod(). Day-count presets, a Fiscal
 * Year submenu, and Custom Range are each their own panel — the popup only
 * widens to fit a second column when one of those is actually open,
 * instead of always reserving empty space on the right.
 */
export function ReportPeriodPicker() {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(defaultRange);
  const [draft, setDraft] = useState(defaultRange);
  // null = just the preset list; "custom" | "fiscalYear" = that panel open.
  const [panel, setPanel] = useState(null);
  const [scriptReady, setScriptReady] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const stored = readCookie(REPORT_PERIOD_COOKIE);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (parsed?.from && parsed?.to) {
        // Mount-time sync from a source React doesn't own (the cookie) —
        // same pattern/justification as app-shell.jsx's sidebar-collapsed
        // sync effect: SSR has no cookie access here, so the default state
        // above must render first, then this corrects it once on the client.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRange(parsed);
        setDraft(parsed);
      }
    } catch {
      // keep the default
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
        setPanel(null);
        setDraft(range);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [range]);

  function applyRange(next) {
    writeReportPeriodCookie(next);
    setRange(next);
    setDraft(next);
    setOpen(false);
    setPanel(null);
    router.refresh();
  }

  const activePreset = PRESETS.find((preset) => rangesEqual(preset.range(), range));
  const fiscalYears = scriptReady ? computeFiscalYears() : [];

  return (
    <div ref={containerRef} className="relative">
      <Script
        id="nepali-datepicker-script"
        src={NEPALI_DATEPICKER_JS_SRC}
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex h-8 items-center gap-2 rounded-full bg-muted/45 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Calendar className="h-4 w-4 shrink-0" />
        <span className="hidden truncate sm:inline">
          {activePreset ? t(activePreset.labelKey) : `${range.from} → ${range.to}`}
        </span>
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-11 right-0 z-50 flex max-h-[min(85vh,640px)] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-lg",
            panel ? "w-[min(94vw,600px)]" : "w-[min(92vw,240px)]"
          )}
        >
          <div className="w-56 shrink-0 divide-y overflow-y-auto border-r">
            {PRESETS.map((preset) => {
              const presetRange = preset.range();
              const active = !panel && activePreset?.key === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyRange(presetRange)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted",
                    active && "bg-primary/8 font-medium text-primary"
                  )}
                >
                  <span>{t(preset.labelKey)}</span>
                  <span className={cn("text-[11px] whitespace-nowrap", active ? "text-primary/70" : "text-muted-foreground")}>
                    {presetRange.from} – {presetRange.to}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPanel("fiscalYear")}
              className={cn(
                "flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted",
                panel === "fiscalYear" && "bg-primary/8 font-medium text-primary"
              )}
            >
              {t("periodFiscalYear")}
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => setPanel("custom")}
              className={cn(
                "flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted",
                panel === "custom" && "bg-primary/8 font-medium text-primary"
              )}
            >
              {t("periodCustomRange")}
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          </div>

          {panel === "fiscalYear" && (
            <div className="min-w-0 flex-1 divide-y overflow-y-auto">
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                {t("back")}
              </button>
              {fiscalYears.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">{t("periodFiscalYearLoading")}</p>
              ) : (
                fiscalYears.map((fy) => {
                  const active = rangesEqual(fy, range);
                  return (
                    <button
                      key={fy.key}
                      type="button"
                      onClick={() => applyRange({ from: fy.from, to: fy.to })}
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted",
                        active && "bg-primary/8 font-medium text-primary"
                      )}
                    >
                      <span>{fy.label}</span>
                      <span className={cn("text-[11px] whitespace-nowrap", active ? "text-primary/70" : "text-muted-foreground")}>
                        {fy.from} – {fy.to}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {panel === "custom" && (
            <div className="min-w-0 flex-1 overflow-y-auto p-4">
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                {t("back")}
              </button>
              <p className="mb-3 text-sm font-medium">{t("periodCustomRange")}</p>
              <div className="mb-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <span>{draft.from}</span>
                <span>{draft.to}</span>
              </div>
              <DualDateField
                id="report-period-range"
                value={draft}
                onChange={(nextRange) => setDraft(nextRange)}
                inline
                range
              />
              <div className="mt-4 flex justify-end">
                <Button type="button" size="sm" onClick={() => applyRange(draft)}>
                  <Check className="h-3.5 w-3.5" />
                  {t("apply")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
