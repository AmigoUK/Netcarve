import { describe, expect, it } from 'vitest';
import { isParseError } from '@/src/lib/ip/errors';
import { MAX128, expandIPv6, formatIPv6, maskV6, parseIPv6 } from '@/src/lib/ip/v6';

function value(input: string): bigint {
  const result = parseIPv6(input);
  if (isParseError(result)) throw new Error(`expected ${input} to parse, got ${result.code}`);
  return result.value;
}

describe('parseIPv6', () => {
  const accepted: Array<[string, bigint]> = [
    ['::', 0n],
    ['::1', 1n],
    ['0:0:0:0:0:0:0:0', 0n],
    ['0000:0000:0000:0000:0000:0000:0000:0001', 1n],
    ['2001:db8::1', 0x20010db8000000000000000000000001n],
    ['2001:0DB8:0000:0000:0000:0000:0000:0001', 0x20010db8000000000000000000000001n],
    ['fe80::', 0xfe800000000000000000000000000000n],
    ['ff02::1', 0xff020000000000000000000000000001n],
    ['1:2:3:4:5:6:7:8', 0x00010002000300040005000600070008n],
    ['1::8', 0x00010000000000000000000000000008n],
    ['::ffff:192.0.2.1', 0x00000000000000000000ffffc0000201n],
    ['::ffff:0:0', 0x00000000000000000000ffff00000000n],
    ['64:ff9b::192.0.2.33', 0x0064ff9b0000000000000000c0000221n],
    ['::1.2.3.4', 0x00000000000000000000000001020304n],
    ['2001:db8:0:0:1::1', 0x20010db8000000000001000000000001n],
  ];

  it.each(accepted)('accepts %s', (input, expected) => {
    expect(value(input)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(value('2001:DB8::AB')).toBe(value('2001:db8::ab'));
  });

  it('reaches the maximum address', () => {
    expect(value('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')).toBe(MAX128);
  });

  it('strips a zone ID and reports it as a warning, not an error', () => {
    const result = parseIPv6('fe80::1%eth0');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0xfe800000000000000000000000000001n);
      expect(result.warnings).toEqual([
        expect.objectContaining({ code: 'ZONE_ID_STRIPPED' }),
      ]);
    }
  });

  const rejected: Array<[string, string]> = [
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['1::2::3', 'DOUBLE_COMPRESSION'],
    ['::1::', 'DOUBLE_COMPRESSION'],
    [':::', 'BAD_GROUP'],
    ['1:2:3:4:5:6:7:8:9', 'TOO_MANY_GROUPS'],
    ['1:2:3:4:5:6:7', 'TOO_FEW_GROUPS'],
    ['1:2:3:4:5:6:7:8::', 'TOO_MANY_GROUPS'],
    ['1:2:3:4:5:6:7:8:', 'BAD_GROUP'],
    [':1:2:3:4:5:6:7:8', 'BAD_GROUP'],
    ['zzzz::1', 'BAD_GROUP'],
    ['12345::1', 'BAD_GROUP'],
    ['2001:db8:::1', 'BAD_GROUP'],
    ['192.0.2.1', 'BAD_FORM'],
    ['::ffff:192.0.2.1:1', 'BAD_FORM'],
    ['1.2.3.4::1', 'BAD_FORM'],
    ['::ffff:999.0.2.1', 'BAD_OCTET'],
    ['fe80::1%', 'BAD_FORM'],
  ];

  it.each(rejected)('rejects %s with %s', (input, code) => {
    const result = parseIPv6(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(code);
  });
});

describe('formatIPv6 (RFC 5952)', () => {
  const vectors: Array<[string, string]> = [
    ['::', '::'],
    ['::1', '::1'],
    ['0:0:0:0:0:0:0:1', '::1'],
    ['2001:0db8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
    ['2001:DB8::1', '2001:db8::1'],
    ['fe80:0:0:0:0:0:0:0', 'fe80::'],
    // A single zero group is never compressed (RFC 5952 §4.2.2).
    ['2001:db8:0:1:1:1:1:1', '2001:db8:0:1:1:1:1:1'],
    // Longest run wins.
    ['2001:0:0:1:0:0:0:1', '2001:0:0:1::1'],
    // Leftmost run wins a tie (RFC 5952 §4.2.3).
    ['2001:db8:0:0:1:0:0:1', '2001:db8::1:0:0:1'],
    ['1:0:0:1:0:0:1:1', '1::1:0:0:1:1'],
    // No leading zeros inside a group; lowercase hex.
    ['0001:0002:0003:0004:0005:0006:0007:0008', '1:2:3:4:5:6:7:8'],
    ['ABCD:EF01:2345:6789:ABCD:EF01:2345:6789', 'abcd:ef01:2345:6789:abcd:ef01:2345:6789'],
    ['::ffff:192.0.2.1', '::ffff:c000:201'],
    ['ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
  ];

  it.each(vectors)('formats %s as %s', (input, expected) => {
    expect(formatIPv6(value(input))).toBe(expected);
  });

  it('round-trips its own output', () => {
    for (const [input] of vectors) {
      const canonical = formatIPv6(value(input));
      expect(formatIPv6(value(canonical))).toBe(canonical);
    }
  });
});

describe('expandIPv6', () => {
  it.each([
    ['::', '0000:0000:0000:0000:0000:0000:0000:0000'],
    ['::1', '0000:0000:0000:0000:0000:0000:0000:0001'],
    ['2001:db8::1', '2001:0db8:0000:0000:0000:0000:0000:0001'],
    ['ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
  ])('expands %s to %s', (input, expected) => {
    expect(expandIPv6(value(input))).toBe(expected);
  });
});

describe('maskV6', () => {
  it.each([
    [0, 0n],
    [1, 0x80000000000000000000000000000000n],
    [64, 0xffffffffffffffff0000000000000000n],
    [127, 0xfffffffffffffffffffffffffffffffen],
    [128, MAX128],
  ])('mask for /%i', (prefix, expected) => {
    expect(maskV6(prefix)).toBe(expected);
  });
});
