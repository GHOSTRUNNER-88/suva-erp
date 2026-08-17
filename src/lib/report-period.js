import { cookies } from "next/headers";
import { REPORT_PERIOD_COOKIE } from "@/lib/report-period-constants";

export { REPORT_PERIOD_COOKIE };

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

// Month-to-date is the smart default (never a blank range, see
// AGENTS.md's "never show 0%"-style smart-default rule) — the real
// picker lives once in the ERP header (see report-period-picker.jsx) and
// every report/dashboard reads the same stored range instead of each
// page defaulting differently.
function defaultRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: isoDate(start), to: isoDate(now) };
}

function parseRange(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.from === "string" && typeof parsed?.to === "string") {
      return { from: parsed.from, to: parsed.to };
    }
  } catch {
    // fall through to default
  }
  return null;
}

/** Server Components/Actions only — the AD ISO {from, to} every report/dashboard should scope its query to. */
export async function getReportPeriod() {
  const cookieStore = await cookies();
  return parseRange(cookieStore.get(REPORT_PERIOD_COOKIE)?.value) ?? defaultRange();
}
