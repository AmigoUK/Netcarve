import { describe, expect, it } from 'vitest';
import {
  bitsOf,
  formatAddress,
  formatCidr,
  makeCidr,
  parseCidr,
  type Cidr,
} from '@/src/lib/ip/cidr';
import { isParseError } from '@/src/lib/ip/errors';

function value(input: string): Cidr {
  const result = parseCidr(input);
  if (isParseError(result)) throw new Error(`expected ${input} to parse, got ${result.code}`);
  return result.value;
}

function codesOf(input: string): string[] {
  const result = parseCidr(input);
  if (isParseError(result)) throw new Error(`expected ${input} to parse, got ${result.code}`);
  return result.warnings.map((w) => w.code);
}

describe('bitsOf', () => {
  it('is 32 for IPv4 and 128 for IPv6', () => {
    expect(bitsOf(4)).toBe(32);
    expect(bitsOf(6)).toBe(128);
  });
});

describe('parseCidr', () => {
  it('parses an IPv4 block', () => {
    expect(value('10.0.0.0/8')).toEqual({ family: 4, address: 0x0a000000, prefix: 8 });
  });

  it('parses an IPv6 block', () => {
    expect(value('2001:db8::/48')).toEqual({
      family: 6,
      address: 0x20010db8000000000000000000000000n,
      prefix: 48,
    });
  });

  it('accepts a space-separated dotted mask', () => {
    expect(value('10.0.0.0 255.255.255.0')).toEqual({
      family: 4,
      address: 0x0a000000,
      prefix: 24,
    });
  });

  it('accepts a slash-separated dotted mask', () => {
    expect(value('10.0.0.0/255.255.0.0').prefix).toBe(16);
  });

  it('keeps the address exactly as entered', () => {
    const cidr = value('192.168.1.37/24');
    expect(cidr.address).toBe(0xc0a80125);
    expect(cidr.prefix).toBe(24);
    expect(codesOf('192.168.1.37/24')).toContain('HOST_BITS_SET');
  });

  it('flags host bits on IPv6 too', () => {
    expect(codesOf('2001:db8::1/48')).toContain('HOST_BITS_SET');
    expect(codesOf('2001:db8::/48')).not.toContain('HOST_BITS_SET');
  });

  it.each([
    ['10.0.0.1', 32],
    ['2001:db8::1', 128],
  ])('assumes a host prefix for the bare address %s', (input, prefix) => {
    expect(value(input).prefix).toBe(prefix);
    expect(codesOf(input)).toContain('ASSUMED_HOST_PREFIX');
  });

  it('trims surrounding whitespace', () => {
    expect(value('  10.0.0.0/8  ')).toEqual(value('10.0.0.0/8'));
  });

  it('carries a stripped zone ID through as a warning', () => {
    expect(codesOf('fe80::1%eth0')).toEqual(
      expect.arrayContaining(['ZONE_ID_STRIPPED', 'ASSUMED_HOST_PREFIX']),
    );
  });

  it('accepts the extremes', () => {
    expect(value('0.0.0.0/0').prefix).toBe(0);
    expect(value('::/0').prefix).toBe(0);
    expect(value('255.255.255.255/32').prefix).toBe(32);
  });

  const rejected: Array<[string, string]> = [
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['10.0.0.0/33', 'BAD_PREFIX'],
    ['2001:db8::/129', 'BAD_PREFIX'],
    ['10.0.0.0/-1', 'BAD_PREFIX'],
    ['10.0.0.0/ab', 'BAD_PREFIX'],
    ['10.0.0.0/', 'BAD_PREFIX'],
    ['10.0.0.0/8/8', 'BAD_FORM'],
    ['10.0.0.0 255.255.255.0 extra', 'BAD_FORM'],
    ['2001:db8::/255.255.0.0', 'MASK_NOT_SUPPORTED'],
    ['10.0.0.0/255.0.255.0', 'NONCONTIGUOUS_MASK'],
    ['10.0.0.256/24', 'BAD_OCTET'],
    ['2001:db8:::1/48', 'BAD_GROUP'],
  ];

  it.each(rejected)('rejects %s with %s', (input, code) => {
    const result = parseCidr(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(code);
  });
});

describe('formatCidr / formatAddress / makeCidr', () => {
  it.each([
    '10.0.0.0/8',
    '192.168.1.37/24',
    '0.0.0.0/0',
    '2001:db8::/48',
    '::1/128',
    'fe80::/10',
  ])('round-trips %s', (input) => {
    expect(formatCidr(value(input))).toBe(input);
  });

  it('formats the address alone', () => {
    expect(formatAddress(value('10.20.30.40/24'))).toBe('10.20.30.40');
    expect(formatAddress(value('2001:0db8::1/64'))).toBe('2001:db8::1');
  });

  it('builds blocks directly, normalising IPv4 to unsigned', () => {
    expect(formatCidr(makeCidr(4, 0xffffffff, 32))).toBe('255.255.255.255/32');
    expect(formatCidr(makeCidr(6, 1n, 128))).toBe('::1/128');
  });
});
