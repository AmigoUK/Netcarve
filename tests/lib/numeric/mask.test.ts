import { describe, expect, it } from 'vitest';
import { maskToPrefix, prefixToMask } from '@/src/lib/numeric/mask';
import { not } from '@/src/lib/numeric/bitwise';
import type { BitWidth, NumericValue } from '@/src/lib/numeric/value';
import { formatIPv4, maskV4, parseV4Mask, wildcardV4 } from '@/src/lib/ip/v4';
import { maskV6 } from '@/src/lib/ip/v6';

const at = (value: bigint, width: BitWidth): NumericValue => ({ value, width });

/**
 * The strongest evidence that the width-generic implementation is right: it has to agree with
 * the long-proven IP code across the whole domain, not merely on a list of chosen cases.
 */
describe('agreement with the IP library', () => {
  it('matches maskV4 for every IPv4 prefix', () => {
    for (let prefix = 0; prefix <= 32; prefix += 1) {
      expect(prefixToMask(prefix, 32).value).toBe(BigInt(maskV4(prefix)));
    }
  });

  it('matches maskV6 for every IPv6 prefix', () => {
    for (let prefix = 0; prefix <= 128; prefix += 1) {
      expect(prefixToMask(prefix, 128).value).toBe(maskV6(prefix));
    }
  });

  it('agrees with parseV4Mask on every contiguous IPv4 mask', () => {
    for (let prefix = 0; prefix <= 32; prefix += 1) {
      const mask = prefixToMask(prefix, 32);
      const viaIp = parseV4Mask(formatIPv4(Number(mask.value)));
      const viaNumeric = maskToPrefix(mask);

      expect(viaIp.ok && viaIp.value).toBe(prefix);
      expect(viaNumeric.ok && viaNumeric.value).toBe(prefix);
    }
  });

  it('produces the same wildcard as wildcardV4', () => {
    for (let prefix = 0; prefix <= 32; prefix += 1) {
      expect(not(prefixToMask(prefix, 32)).value).toBe(BigInt(wildcardV4(prefix)));
    }
  });
});

describe('prefixToMask', () => {
  it.each<[number, BitWidth, bigint]>([
    [0, 8, 0n],
    [1, 8, 0b1000_0000n],
    [8, 8, 0xffn],
    [24, 32, 0xffffff00n],
    [64, 128, 0xffffffffffffffff0000000000000000n],
    [128, 128, 2n ** 128n - 1n],
  ])('/%i at %i bits', (prefix, width, expected) => {
    expect(prefixToMask(prefix, width).value).toBe(expected);
  });

  it('carries the width through', () => {
    expect(prefixToMask(4, 16).width).toBe(16);
  });

  it('clamps a prefix outside the width', () => {
    expect(prefixToMask(-5, 8).value).toBe(0n);
    expect(prefixToMask(99, 8).value).toBe(0xffn);
    expect(prefixToMask(4.7, 8).value).toBe(0b1111_0000n);
  });
});

describe('maskToPrefix', () => {
  it('reads a contiguous mask at any width', () => {
    expect(maskToPrefix(at(0n, 8))).toMatchObject({ ok: true, value: 0 });
    expect(maskToPrefix(at(0xffn, 8))).toMatchObject({ ok: true, value: 8 });
    expect(maskToPrefix(at(0b1111_0000n, 8))).toMatchObject({ ok: true, value: 4 });
    expect(maskToPrefix(at(2n ** 128n - 1n, 128))).toMatchObject({ ok: true, value: 128 });
  });

  it.each<[bigint, BitWidth]>([
    [0xff00ff00n, 32],
    [0b0111_1111n, 8],
    [0b1111_1101n, 8],
    [0b0000_0001n, 8],
  ])('refuses the non-contiguous mask %s', (value, width) => {
    const result = maskToPrefix(at(value, width));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NONCONTIGUOUS_MASK');
  });

  it('round-trips against prefixToMask at every width', () => {
    for (const width of [8, 16, 32, 48, 64, 128] as const) {
      for (let prefix = 0; prefix <= width; prefix += 1) {
        const result = maskToPrefix(prefixToMask(prefix, width));
        expect(result.ok && result.value).toBe(prefix);
      }
    }
  });
});
