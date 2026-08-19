/**
 * Display helpers for numbers that outgrow `Number`.
 *
 * Spec §4.4: totals above 2⁵³ are shown as a power of two with an approximate decimal in
 * scientific notation alongside. The exact digits are always kept so a click-to-copy still
 * yields the real value.
 */

const SUPERSCRIPT_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

/** The exact-decimal ceiling; above this a count is rendered as a power of two. */
export const EXACT_DECIMAL_LIMIT = 2n ** 53n;

export interface CountDisplay {
  /** What to show: a grouped decimal, or `2⁶⁴` for very large counts. */
  readonly primary: string;
  /** A scientific approximation, present only when `primary` is not the exact decimal. */
  readonly approx?: string;
  /** The exact decimal digits — always available for copying. */
  readonly exact: string;
}

/** Renders a non-negative integer as superscript digits. */
export function superscript(value: number): string {
  return String(value)
    .split('')
    .map((digit) => SUPERSCRIPT_DIGITS[Number(digit)] as string)
    .join('');
}

function isPowerOfTwo(value: bigint): boolean {
  return value > 0n && (value & (value - 1n)) === 0n;
}

function exponentOf(value: bigint): number {
  let exponent = 0;
  let remaining = value;
  while (remaining > 1n) {
    remaining >>= 1n;
    exponent += 1;
  }
  return exponent;
}

/** `≈ 1.84 × 10¹⁹` — two decimal places of mantissa. */
export function scientific(value: bigint): string {
  const digits = value.toString();
  const exponent = digits.length - 1;
  const mantissa = `${digits.slice(0, 1)}.${digits.slice(1, 3).padEnd(2, '0')}`;
  return `≈ ${mantissa} × 10${superscript(exponent)}`;
}

/** Groups digits in the British convention: `4,294,967,296`. */
export function groupDigits(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Chooses how to show an address count: grouped digits while that stays readable, and a
 * power of two plus a scientific approximation once it does not.
 */
export function formatCount(value: bigint): CountDisplay {
  const exact = groupDigits(value);
  if (value <= EXACT_DECIMAL_LIMIT) {
    return { primary: exact, exact };
  }
  const approx = scientific(value);
  if (isPowerOfTwo(value)) {
    return { primary: `2${superscript(exponentOf(value))}`, approx, exact };
  }
  return { primary: approx, exact };
}

/** A percentage rounded to one decimal place, without a trailing `.0`. */
export function formatPercent(part: bigint, whole: bigint): string {
  if (whole === 0n) return '0';
  // Round to nearest rather than truncating, so 240/256 reads as 93.8 % and not 93.7 %.
  const tenths = (part * 1000n + whole / 2n) / whole;
  const value = Number(tenths) / 10;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** A short British date, used on project cards. */
export function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
