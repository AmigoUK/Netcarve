/**
 * Masks and prefix lengths, generic over the width.
 *
 * `maskV4` and `maskV6` already do this for their own families; these do it for any width the
 * tools offer. The test suite pins the two together — `prefixToMask(p, 32)` must equal
 * `maskV4(p)` for every prefix, and likewise at 128 — so the generic version cannot drift away
 * from the code the rest of the app depends on.
 */

import { fail, ok, type ParseResult } from '../errors';
import { maskOfWidth, type BitWidth, type NumericValue } from './value';

/**
 * The contiguous mask for a prefix length. A prefix outside `0…width` is clamped, so the
 * caller never has to guard a slider or a number field.
 *
 * No special case is needed for `/0`: shifting a full mask right by the whole width and back
 * again leaves zero.
 */
export function prefixToMask(prefix: number, width: BitWidth): NumericValue {
  const clamped = Math.min(Math.max(Math.trunc(prefix), 0), width);
  const hostBits = BigInt(width - clamped);
  return { value: (maskOfWidth(width) >> hostBits) << hostBits, width };
}

/**
 * The prefix length of a mask, walking from the most significant bit. A mask must be a run of
 * ones followed only by zeros; anything else is refused rather than approximated.
 */
export function maskToPrefix(mask: NumericValue): ParseResult<number> {
  let prefix = 0;
  let seenZero = false;

  for (let index = 0; index < mask.width; index += 1) {
    const bit = (mask.value >> BigInt(mask.width - 1 - index)) & 1n;
    if (bit === 1n) {
      if (seenZero) {
        return fail(
          'NONCONTIGUOUS_MASK',
          'A network mask must be a run of ones followed only by zeros.',
        );
      }
      prefix += 1;
    } else {
      seenZero = true;
    }
  }

  return ok(prefix);
}
