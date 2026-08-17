// Zero-dependency — shared by the client picker (report-period-picker.jsx)
// and the server reader (report-period.js, which imports next/headers and
// must never be pulled into a Client Component's bundle).
export const REPORT_PERIOD_COOKIE = "suva-report-range";
