"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

/**
 * Counts up from its previous value (0 on first mount) to `value` whenever
 * `value` changes — used by the dashboard KPI cards so real numbers read as
 * "arriving" instead of popping in on load. Matches this app's restrained
 * animation style (see components/ui/sheet.jsx / modal.jsx: short-ish
 * durations, easeOut, no bounce/overshoot) rather than a flashy counter.
 *
 * `format` receives the in-flight number and returns the string to render
 * (currency, thousands separators, decimals) — defaults to a plain rounded
 * integer with locale grouping.
 */
export function AnimatedNumber({ value, duration = 0.6, format = (n) => Math.round(n).toLocaleString("en-IN") }) {
  const numericValue = Number(value) || 0;
  const [display, setDisplay] = useState(0);
  const previousValueRef = useRef(0);

  useEffect(() => {
    const controls = animate(previousValueRef.current, numericValue, {
      duration,
      ease: "easeOut",
      onUpdate: (latest) => setDisplay(latest),
      onComplete: () => {
        previousValueRef.current = numericValue;
      },
    });
    return () => controls.stop();
  }, [numericValue, duration]);

  return format(display);
}
