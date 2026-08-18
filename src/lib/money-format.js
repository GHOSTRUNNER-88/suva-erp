// One shared NPR formatter — redesign.md's FINANCIAL COLUMNS rule ("do not
// mix 125450 / Rs 125,450 / NPR125450"). Every dashboard/report money value
// should go through this instead of a local toLocaleString() call.
export function formatMoney(amount) {
  return `NPR ${Math.abs(Number(amount) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Compact form for chart axes/tooltips where full precision would crowd the
// label (e.g. "NPR 1.2L" instead of "NPR 120,000.00") — Indian numbering
// (lakh/crore) since every other money value in this app already uses
// "en-IN" grouping.
export function formatMoneyCompact(amount) {
  const value = Number(amount) || 0;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_00_00_000) return `${sign}NPR ${(abs / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `${sign}NPR ${(abs / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}NPR ${(abs / 1_000).toFixed(1)}k`;
  return `${sign}NPR ${abs.toFixed(0)}`;
}

export function formatCount(amount) {
  return Math.round(Number(amount) || 0).toLocaleString("en-IN");
}
