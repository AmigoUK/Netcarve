import { describe, expect, it } from 'vitest';
import { isParseError } from '@/src/lib/errors';
import { formatIPv4, maskV4, parseIPv4, parseV4Mask, wildcardV4 } from '@/src/lib/ip/v4';

/** Unwrap a parse expected to succeed. */
function value(input: string): number {
  const result = parseIPv4(input);
  if (isParseError(result)) throw new Error(`expected ${input} to parse, got ${result.code}`);
  return result.value;
}

describe('parseIPv4', () => {
  const accepted: Array<[string, number]> = [
    ['0.0.0.0', 0],
    ['255.255.255.255', 0xffffffff],
    ['192.168.1.37', 0xc0a80125],
    ['10.0.0.1', 0x0a000001],
    ['127.0.0.1', 0x7f000001],
    ['1.2.3.4', 0x01020304],
    ['8.8.8.8', 0x08080808],
  ];

  it.each(accepted)('accepts %s', (input, expected) => {
    expect(value(input)).toBe(expected);
  });

  it('always yields an unsigned 32-bit number', () => {
    expect(value('255.255.255.255')).toBeGreaterThan(0);
    expect(value('224.0.0.1')).toBe(0xe0000001);
  });

  it('reports no warnings for a clean address', () => {
    const result = parseIPv4('10.0.0.1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).toEqual([]);
  });

  const rejected: Array<[string, string]> = [
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['010.1.1.1', 'BAD_OCTET'],
    ['1.02.3.4', 'BAD_OCTET'],
    ['00.0.0.0', 'BAD_OCTET'],
    ['256.1.1.1', 'BAD_OCTET'],
    ['1.1.1.999', 'BAD_OCTET'],
    ['1.1.1.-1', 'BAD_OCTET'],
    ['1.1.1.a', 'BAD_OCTET'],
    ['1.1.1.1e2', 'BAD_OCTET'],
    ['1.1.1.', 'BAD_OCTET'],
    ['.1.1.1', 'BAD_OCTET'],
    ['1..1.1', 'BAD_OCTET'],
    ['10.1', 'BAD_FORM'],
    ['1.2.3.4.5', 'BAD_FORM'],
    ['1.2.3.4 ', 'BAD_OCTET'],
    [' 1.2.3.4', 'BAD_OCTET'],
    ['1. 2.3.4', 'BAD_OCTET'],
    ['2001:db8::1', 'BAD_FORM'],
  ];

  it.each(rejected)('rejects %s with %s', (input, code) => {
    const result = parseIPv4(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(code);
  });

  it('carries the offending fragment in `detail`', () => {
    const result = parseIPv4('1.1.1.999');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toBe('999');
  });
});

describe('formatIPv4', () => {
  it.each([
    [0, '0.0.0.0'],
    [0xffffffff, '255.255.255.255'],
    [0xc0a80125, '192.168.1.37'],
    [0x0a000001, '10.0.0.1'],
  ])('formats %i as %s', (n, expected) => {
    expect(formatIPv4(n)).toBe(expected);
  });

  it('round-trips every parsed address', () => {
    for (const input of ['0.0.0.0', '255.255.255.255', '172.16.31.255', '100.64.0.1']) {
      expect(formatIPv4(value(input))).toBe(input);
    }
  });
});

describe('maskV4', () => {
  it.each([
    [0, 0x00000000],
    [1, 0x80000000],
    [8, 0xff000000],
    [24, 0xffffff00],
    [30, 0xfffffffc],
    [31, 0xfffffffe],
    [32, 0xffffffff],
  ])('mask for /%i', (prefix, expected) => {
    expect(maskV4(prefix)).toBe(expected);
  });
});

describe('wildcardV4', () => {
  it.each([
    [24, '0.0.0.255'],
    [32, '0.0.0.0'],
    [0, '255.255.255.255'],
    [30, '0.0.0.3'],
  ])('wildcard for /%i is %s', (prefix, expected) => {
    expect(formatIPv4(wildcardV4(prefix))).toBe(expected);
  });
});

describe('parseV4Mask', () => {
  it.each([
    ['0.0.0.0', 0],
    ['128.0.0.0', 1],
    ['255.0.0.0', 8],
    ['255.255.255.0', 24],
    ['255.255.255.252', 30],
    ['255.255.255.255', 32],
  ])('%s is /%i', (input, prefix) => {
    const result = parseV4Mask(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(prefix);
  });

  it.each([['255.0.255.0'], ['0.255.255.255'], ['255.255.1.0'], ['128.0.0.1']])(
    'rejects the non-contiguous mask %s',
    (input) => {
      const result = parseV4Mask(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('NONCONTIGUOUS_MASK');
    },
  );

  it('propagates an address-level parse error unchanged', () => {
    const result = parseV4Mask('255.255.300.0');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('BAD_OCTET');
  });
});
