/**
 * Shared money math for the Sales/Purchase/Finance modules — one calculator,
 * not reimplemented per module (see ../../AGENTS.md §5). Implements the
 * universal VAT/discount formula documented in AGENTS.md §6 (verified
 * against legacy PHP, identical across sales invoice, purchase bill, credit
 * note, and debit note):
 *
 *   afterDiscount = subtotal − headerDiscountAmount
 *   vatAmount     = afterDiscount × vatPercent / 100   (only if VAT applies)
 *   total         = afterDiscount + vatAmount
 *
 * Every discount (header and per-line) is a {value, type} pair, type ∈
 * "percent" | "amount". Rounds to 2 decimals at every stage (matching the
 * DECIMAL(14,2) column precision on every header/line total column) so a
 * document's stored total always matches the sum a human would get
 * recomputing it by hand from the stored line rows — never carry unrounded
 * intermediate floats across a stage boundary.
 *
 * Per ../../AGENTS.md §5's "never trust client-submitted totals" rule, every
 * module's actions.js must call calcDocumentTotals() server-side on the
 * submitted lines before insert/update, never persist a client-posted total
 * directly.
 */

// Avoids the classic (0.1 + 0.2).toFixed(2) style drift by rounding through
// integer cents rather than trusting toFixed's own rounding.
export function round2(value) {
  const n = Number(value) || 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function discountAmount(base, type, value) {
  const v = Number(value) || 0;
  if (type === "percent") return round2((base * v) / 100);
  return round2(v);
}

/**
 * One line's subtotal/discount/total. `quantity` is expected pre-rounded to
 * a whole number by the caller for every document type ported from legacy
 * except delivery challans (which carry no money at all) — see AGENTS.md
 * §6's "line quantities are always whole numbers in practice" note. This
 * function doesn't round quantity itself since order/quotation lines store
 * it as a genuine INT column while invoice/bill/credit/debit lines store
 * DECIMAL(14,2) holding an integer value — rounding is the caller's job so
 * it can pick the right column type to write.
 */
export function calcLineTotal({ quantity, rate, discType = "percent", discValue = 0 }) {
  const qty = Number(quantity) || 0;
  const lineSubtotal = round2(qty * (Number(rate) || 0));
  const discAmount = discountAmount(lineSubtotal, discType, discValue);
  const lineTotal = round2(lineSubtotal - discAmount);
  const discPercent = discType === "percent" ? Number(discValue) || 0 : 0;

  return { lineSubtotal, discPercent, discAmount, lineTotal };
}

/**
 * Full document totals from a set of already-computed lines (each with a
 * `lineTotal`) plus the header-level discount/VAT. `subtotal` is the sum of
 * line totals (i.e. already net of each line's own discount) — the header
 * discount then applies on top of that, matching legacy's two-tier
 * discount model (a line can discount itself, and the document as a whole
 * can discount again on the post-line-discount subtotal).
 */
export function calcDocumentTotals({ lines, discType = "percent", discValue = 0, vatPercent = 0, isVatApplicable = false }) {
  const subtotal = round2(lines.reduce((sum, line) => sum + (Number(line.lineTotal) || 0), 0));
  const discAmount = discountAmount(subtotal, discType, discValue);
  const afterDiscount = round2(subtotal - discAmount);
  const vatAmount = isVatApplicable ? round2((afterDiscount * (Number(vatPercent) || 0)) / 100) : 0;
  const totalAmount = round2(afterDiscount + vatAmount);
  const discPercent = discType === "percent" ? Number(discValue) || 0 : 0;

  return { subtotal, discPercent, discAmount, vatAmount, totalAmount };
}
