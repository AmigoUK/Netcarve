/**
 * Bitwise operations on values of known width.
 *
 * Everything here truncates to the operand's width, which is what "bitwise" means — discarding
 * bits is the point of a shift, and the loss is visible on the bit field. Arithmetic goes the
 * other way and refuses to leave the width; that half arrives with the address operations
 * (spec §2, FR-TOOL-02).
 */

import { fail, ok, type ParseResult } from '../errors';
import { maskOfWidth, type NumericValue } from './value';

export type BitwiseOp = 'and' | 'or' | 'xor' | 'andnot';

/** The two-operand operations, in the order the picker lists them. */
export const BITWISE_OPS: readonly BitwiseOp[] = ['and', 'or', 'xor', 'andnot'];

/**
 * Combines two values of the same width.
 *
 * The view has one width selector for the whole panel, so both operands are always parsed at
 * the same width and a mismatch cannot arise through the interface. The guard is here for
 * callers reaching the library directly (FR-TOOL-05).
 */
export function applyBitwise(
  op: BitwiseOp,
  a: NumericValue,
  b: NumericValue,
): ParseResult<NumericValue> {
  if (a.width !== b.width) {
    return fail('WIDTH_MISMATCH', 'Both values must have the same width.');
  }

  const mask = maskOfWidth(a.width);
  const combined =
    op === 'and'
      ? a.value & b.value
      : op === 'or'
        ? a.value | b.value
        : op === 'xor'
          ? a.value ^ b.value
          : a.value & (~b.value & mask);

  return ok({ value: combined & mask, width: a.width });
}

/** The complement within the width. On a network mask this is its wildcard. */
export const not = (value: NumericValue): NumericValue => ({
  value: ~value.value & maskOfWidth(value.width),
  width: value.width,
});

/** A shift count is a whole number of places, never negative. */
const places = (by: number): number => Math.max(0, Math.trunc(by));

export function shiftLeft(value: NumericValue, by: number): NumericValue {
  const count = places(by);
  if (count >= value.width) return { value: 0n, width: value.width };
  return { value: (value.value << BigInt(count)) & maskOfWidth(value.width), width: value.width };
}

/** Logical, never arithmetic: the value is unsigned, so nothing is sign-extended. */
export function shiftRight(value: NumericValue, by: number): NumericValue {
  const count = places(by);
  if (count >= value.width) return { value: 0n, width: value.width };
  return { value: value.value >> BigInt(count), width: value.width };
}

/** How many bits are set — the prefix length of a contiguous mask. */
export function popCount(value: NumericValue): number {
  let count = 0;
  let remaining = value.value;
  while (remaining > 0n) {
    if ((remaining & 1n) === 1n) count += 1;
    remaining >>= 1n;
  }
  return count;
}

/**
 * Flips one bit. `index` counts from the **most significant** bit, so it matches the left-to-right
 * order the bit field draws, and an index outside the width leaves the value alone.
 */
export function toggleBit(value: NumericValue, index: number): NumericValue {
  if (index < 0 || index >= value.width) return value;
  return {
    value: value.value ^ (1n << BigInt(value.width - 1 - index)),
    width: value.width,
  };
}
