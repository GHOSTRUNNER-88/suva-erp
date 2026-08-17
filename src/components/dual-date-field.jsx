"use client";

import { useEffect, useId, useRef, useState } from "react";
import Script from "next/script";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CSS_HREF =
  "https://nepalidatepicker.sajanmaharjan.com.np/v5/nepali.datepicker/css/nepali.datepicker.v5.0.6.min.css";
const JS_SRC =
  "https://nepalidatepicker.sajanmaharjan.com.np/v5/nepali.datepicker/js/nepali.datepicker.v5.0.6.min.js";
const CSS_LINK_ID = "nepali-datepicker-css";

function ensureCss() {
  if (typeof document === "undefined" || document.getElementById(CSS_LINK_ID)) {
    return;
  }
  const link = document.createElement("link");
  link.id = CSS_LINK_ID;
  link.rel = "stylesheet";
  link.href = CSS_HREF;
  document.head.appendChild(link);
}

function setInputValue(el, value) {
  el.value = value;
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

/**
 * The one date-input component for the whole app (AGENTS.md §4 — every date
 * anywhere must support both BS and AD, via one shared implementation, not
 * hand-rolled per screen).
 *
 * - Default (popup, single date): a single field, not two side-by-side
 *   boxes — the sajanmaharjan NepaliDatePicker widget's own
 *   `miniEnglishDates` option shows the AD date alongside BS right inside
 *   the picker popup. `value`/`onChange` speak one AD ISO `YYYY-MM-DD`.
 * - `inline`: the calendar renders permanently open instead of behind a
 *   click. Per the widget's real source (confirmed via fetching the actual
 *   minified JS, not just its docs), inline mode does
 *   `inputElement.appendChild(calendarDiv)`, which only renders visibly on
 *   an element that can hold children, so this mode targets a <div>, not
 *   an <input>.
 * - `range`: ONE calendar for picking a start+end date, instead of two
 *   separate fields — the widget's own `range: true` mode (confirmed via
 *   its source: `onSelect` receives an array of 2 `{value,year,month,day}`
 *   objects instead of one when `range` or `multiple` is set). Only
 *   meaningful combined with `inline`. `value`/`onChange` become
 *   `{from, to}` (each AD ISO) instead of a single string.
 *
 * If the third-party script fails to load, non-range mode falls back to a
 * plain native `<input type="date">` so the field is never completely
 * unusable (no range fallback yet — range is currently only used by the
 * report-period picker, which already has day-count presets as a
 * non-calendar fallback path).
 *
 * `mode` (light/dark) is the widget's real option name — confirmed against
 * its actual source; an earlier version of this component sent `theme`
 * instead, which the widget silently ignores.
 */
export function DualDateField({
  id,
  label,
  value,
  onChange,
  required = false,
  className = "",
  inline = false,
  range = false,
}) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const reactId = useId();
  const fieldId = id ?? reactId;
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);

  useEffect(ensureCss, []);

  useEffect(() => {
    const el = inline ? containerRef.current : inputRef.current;
    if (!scriptReady || !el || typeof el.NepaliDatePicker !== "function") {
      return;
    }

    let reattachTimer = null;

    function applyBsSelection(bsIso) {
      if (!inline && inputRef.current) inputRef.current.value = bsIso;
      try {
        const converted = window.NepaliFunctions?.BS2AD?.(bsIso);
        const adIso = normalizeToIso(converted);
        if (adIso) onChange(adIso);
      } catch {
        // Widget conversion unavailable — value stays whatever it was;
        // the native-date fallback below still works independently.
      }
    }

    function applyRangeSelection(dates) {
      try {
        const [startRaw, endRaw] = dates;
        const startBs = normalizeToIso(startRaw?.value ?? startRaw);
        const endBs = normalizeToIso(endRaw?.value ?? endRaw ?? startRaw?.value ?? startRaw);
        const startAd = startBs ? normalizeToIso(window.NepaliFunctions?.BS2AD?.(startBs)) : null;
        const endAd = endBs ? normalizeToIso(window.NepaliFunctions?.BS2AD?.(endBs)) : null;
        if (startAd) onChange({ from: startAd, to: endAd ?? startAd });
      } catch {
        // Widget conversion unavailable — value stays whatever it was.
      }
    }

    function attach() {
      el.NepaliDatePicker({
        dateFormat: "YYYY-MM-DD",
        language: "english",
        miniEnglishDates: true,
        mode: resolvedTheme === "dark" ? "dark" : "light",
        inline,
        range,
        onSelect: (date) => {
          if (range) {
            if (Array.isArray(date) && date.length > 0) applyRangeSelection(date);
            // The widget's own selectDate() unconditionally calls
            // hideDatePicker() (which .remove()s the calendar element)
            // once a 2-date range is complete — with no check for
            // inline mode (confirmed in its source; not something this
            // app can patch). Re-attaching restores the inline calendar
            // instead of leaving it gone after the first full selection.
            if (inline && Array.isArray(date) && date.length >= 2) {
              reattachTimer = window.setTimeout(attach, 50);
            }
            return;
          }
          const bsIso = normalizeToIso(typeof date === "string" ? date : (date?.value ?? el.value));
          if (bsIso) applyBsSelection(bsIso);
        },
      });
    }

    attach();

    if (inline) {
      return () => {
        if (reattachTimer) window.clearTimeout(reattachTimer);
      };
    }

    function handleNativeChange() {
      const bsIso = normalizeToIso(el.value);
      if (bsIso) applyBsSelection(bsIso);
    }
    el.addEventListener("change", handleNativeChange);
    return () => {
      el.removeEventListener("change", handleNativeChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady, resolvedTheme, inline, range]);

  useEffect(() => {
    if (range) return;
    const el = inline ? containerRef.current?.querySelector("input") : inputRef.current;
    if (!el || !value || typeof window === "undefined" || !window.NepaliFunctions?.AD2BS) {
      return;
    }
    try {
      const converted = window.NepaliFunctions.AD2BS(value);
      const bsIso = normalizeToIso(converted);
      if (bsIso && bsIso !== el.value) {
        setInputValue(el, bsIso);
      }
    } catch {
      // ignore — fallback field still works standalone
    }
  }, [value, scriptReady, inline, range]);

  return (
    <div className={`space-y-1.5 ${className}`}>
      <Script
        id="nepali-datepicker-script"
        src={JS_SRC}
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => setScriptFailed(true)}
      />
      {label && (
        <Label htmlFor={fieldId}>
          {label}
          {required ? " *" : ""}
        </Label>
      )}
      {scriptFailed && !range ? (
        <Input
          type="date"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="h-11"
        />
      ) : inline || range ? (
        <div ref={containerRef} id={fieldId} className="ndp-inline-host" />
      ) : (
        <Input ref={inputRef} id={fieldId} type="text" autoComplete="off" placeholder={t("bsDate")} className="h-11" />
      )}
    </div>
  );
}
