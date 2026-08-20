/**
 * IPv4 primitives.
 *
 * An IPv4 address is a plain `number` held with unsigned 32-bit semantics: every bitwise
 * result is passed through `>>> 0` before it leaves this module, so callers never see the
 * negative values JavaScript's signed bitwise operators would otherwise produce.
 */

import { fail, ok, type ParseResult } from '../errors';

export const V4_BITS = 32;
export const V4_MAX = 0xffffffff;

/**
 * A single decimal octet: `0`, or a 1–3 digit number with no leading zero.
 * Leading zeros are rejected outright because `010` is octal in too many tools to be safe.
 */
const OCTET_PATTERN = /^(?:0|[1-9][0-9]{0,2})$/;

/**
 * Strict dotted-quad parser. Four decimal octets 0–255, no shorthand, no whitespace padding,
 * no leading zeros.
 */
export function parseIPv4(input: string): ParseResult<number> {
  if (input.trim() === '') {
    return fail('EMPTY', 'Enter an IPv4 address.');
  }

  const parts = input.split('.');
  if (parts.length !== 4) {
    return fail('BAD_FORM', 'An IPv4 address needs exactly four dot-separated octets.', input);
  }

  let address = 0;
  for (const part of parts) {
    if (!OCTET_PATTERN.test(part)) {
      return fail('BAD_OCTET', 'Each octet must be a plain number from 0 to 255.', part);
    }
    const octet = Number(part);
    if (octet > 255) {
      return fail('BAD_OCTET', 'Each octet must be a plain number from 0 to 255.', part);
    }
    address = ((address << 8) | octet) >>> 0;
  }

  return ok(address);
}

/** Renders an unsigned 32-bit address as a dotted quad. */
export function formatIPv4(address: number): string {
  const a = address >>> 0;
  return `${(a >>> 24) & 0xff}.${(a >>> 16) & 0xff}.${(a >>> 8) & 0xff}.${a & 0xff}`;
}

/** The contiguous network mask for a prefix length of 0–32. */
export function maskV4(prefix: number): number {
  return prefix === 0 ? 0 : (V4_MAX << (V4_BITS - prefix)) >>> 0;
}

/** The inverse (Cisco wildcard) mask for a prefix length of 0–32. */
export function wildcardV4(prefix: number): number {
  return ~maskV4(prefix) >>> 0;
}

/**
 * Converts a dotted network mask such as `255.255.255.0` into its prefix length.
 * The mask must be contiguous — a run of ones followed only by zeros.
 */
export function parseV4Mask(input: string): ParseResult<number> {
  const parsed = parseIPv4(input);
  if (!parsed.ok) return parsed;

  let remaining = parsed.value;
  let prefix = 0;
  while (prefix < V4_BITS && (remaining & 0x80000000) !== 0) {
    prefix += 1;
    remaining = (remaining << 1) >>> 0;
  }
  if (remaining !== 0) {
    return fail(
      'NONCONTIGUOUS_MASK',
      'A network mask must be a run of ones followed only by zeros.',
      input,
    );
  }

  return ok(prefix);
}
