/**
 * A number of known width — the value type behind the base converter and the bit tools.
 *
 * The width is the whole point. `NOT 0xFF` is `0x00` in eight bits and `0xFFFFFF00` in
 * thirty-two, so a calculator that infers the width from the digit count answers a question
 * nobody asked. Here the width travels with the value, and the view always shows which one is
 * in force (spec §2, FR-TOOL-01).
 */

import { fail, ok, type ParseResult } from '../errors';
import { formatIPv4, parseIPv4 } from '../ip/v4';
import { formatIPv6, parseIPv6 } from '../ip/v6';

export type BitWidth = 8 | 16 | 32 | 48 | 64 | 128;

/** Every width the tools offer, narrowest first. */
export const BIT_WIDTHS: readonly BitWidth[] = [8, 16, 32, 48, 64, 128];

/**
 * The narrowest width a bare number is ever given. Network work is overwhelmingly 32-bit, and
 * quietly treating `0xFF` as an eight-bit value would surprise more often than it would help.
 */
const MIN_BARE_WIDTH: BitWidth = 32;

export interface NumericValue {
  /** Always `0 <= value <= maskOfWidth(width)`. */
  readonly value: bigint;
  readonly width: BitWidth;
}

/** Which spelling the input used. Drives the initial width and the "read as" chip. */
export type NumericForm = 'decimal' | 'hex' | 'binary' | 'dotted-quad' | 'ipv6';

export interface ParsedNumeric {
  readonly value: NumericValue;
  readonly form: NumericForm;
}

/** All ones, at the given width. */
export const maskOfWidth = (width: BitWidth): bigint => (1n << BigInt(width)) - 1n;

const fits = (value: bigint, width: BitWidth): boolean => value <= maskOfWidth(width);

/** The widths that can hold `value` — exactly the ones the selector leaves enabled. */
export function widthsFor(value: bigint): BitWidth[] {
  return BIT_WIDTHS.filter((width) => fits(value, width));
}

const DOTTED_QUAD = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const HEX_DIGITS = /^[0-9a-f]+$/i;
const BINARY_DIGITS = /^[01]+$/;
const DECIMAL_DIGITS = /^\d+$/;

function widthFor(value: bigint, form: NumericForm, requested?: BitWidth): ParseResult<BitWidth> {
  if (requested !== undefined) {
    return fits(value, requested)
      ? ok(requested)
      : fail('DOES_NOT_FIT', 'That value does not fit in the chosen width.', `${requested} bits`);
  }
  if (form === 'dotted-quad') return ok(32);
  if (form === 'ipv6') return ok(128);

  const found = BIT_WIDTHS.find((width) => width >= MIN_BARE_WIDTH && fits(value, width));
  return found === undefined
    ? fail('DOES_NOT_FIT', 'That value is wider than 128 bits.')
    : ok(found);
}

function build(value: bigint, form: NumericForm, requested?: BitWidth): ParseResult<ParsedNumeric> {
  const width = widthFor(value, form, requested);
  if (!width.ok) return width;
  return ok({ value: { value, width: width.value }, form });
}

/**
 * Reads a value in any spelling the tools accept.
 *
 * The dispatch order is what keeps it unambiguous: address forms first, because they carry
 * their own punctuation, then the prefixed radices, then plain decimal. A bare `C0A8` is
 * *refused* rather than guessed at — `123` is both a decimal and a hexadecimal number, and
 * guessing there is exactly the silent mistake this module exists to avoid (FR-TOOL-04).
 */
export function parseNumeric(input: string, width?: BitWidth): ParseResult<ParsedNumeric> {
  const trimmed = input.trim();
  if (trimmed === '') return fail('EMPTY', 'Enter a value.');

  // Underscores are a readability aid, as in `0b1100_0000`.
  const text = trimmed.replace(/_/g, '');

  if (text.includes(':')) {
    const address = parseIPv6(text);
    if (!address.ok) return address;
    return build(address.value, 'ipv6', width);
  }

  if (DOTTED_QUAD.test(text)) {
    const address = parseIPv4(text);
    if (!address.ok) return address;
    return build(BigInt(address.value), 'dotted-quad', width);
  }

  const radix = text.slice(0, 2).toLowerCase();
  const digits = text.slice(2);

  if (radix === '0x') {
    return HEX_DIGITS.test(digits)
      ? build(BigInt(`0x${digits}`), 'hex', width)
      : fail('BAD_DIGITS', 'Hexadecimal digits are 0–9 and A–F.', digits);
  }

  if (radix === '0b') {
    return BINARY_DIGITS.test(digits)
      ? build(BigInt(`0b${digits}`), 'binary', width)
      : fail('BAD_DIGITS', 'Binary digits are 0 and 1.', digits);
  }

  if (DECIMAL_DIGITS.test(text)) {
    return build(BigInt(text), 'decimal', width);
  }

  if (HEX_DIGITS.test(text)) {
    return fail(
      'MISSING_RADIX_PREFIX',
      'Prefix hexadecimal with 0x and binary with 0b.',
      text,
    );
  }

  return fail('BAD_DIGITS', 'That is not a number NetCarve can read.', text);
}

/**
 * Re-widths a value. Narrowing below what the value needs is refused rather than truncated —
 * the view disables those widths, so this path exists for callers reaching the library
 * directly (FR-TOOL-03).
 */
export function withWidth(value: NumericValue, width: BitWidth): ParseResult<NumericValue> {
  return fits(value.value, width)
    ? ok({ value: value.value, width })
    : fail('DOES_NOT_FIT', 'That value does not fit in the chosen width.', `${width} bits`);
}

/** Plain digits, with no grouping, so the row pastes straight into a config. */
export const toDecimal = (value: NumericValue): string => value.value.toString();

/** `0x`-prefixed, upper case, padded to the full width. */
export const toHex = (value: NumericValue): string =>
  `0x${value.value.toString(16).toUpperCase().padStart(value.width / 4, '0')}`;

/** Padded to the full width and grouped into bytes. */
export const toBinary = (value: NumericValue): string =>
  (value.value.toString(2).padStart(value.width, '0').match(/.{8}/g) ?? []).join(' ');

/** The address spelling for widths that have one. MAC (48-bit) arrives with its own module. */
export function toAddressForm(value: NumericValue): string | undefined {
  if (value.width === 32) return formatIPv4(Number(value.value));
  if (value.width === 128) return formatIPv6(value.value);
  return undefined;
}
