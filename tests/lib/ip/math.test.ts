import { describe, expect, it } from 'vitest';
import {
  formatAddressValue,
  formatCidr,
  parseCidr,
  type Cidr,
  type Cidr4,
} from '@/src/lib/ip/cidr';
import { isParseError } from '@/src/lib/ip/errors';
import {
  broadcastOf,
  compareCidr,
  contains,
  lastAddressOf,
  networkAddressOf,
  networkOf,
  prefixForSize,
  relationOf,
  splitOnce,
  totalAddresses,
  usableRange,
} from '@/src/lib/ip/math';

function block(input: string): Cidr {
  const result = parseCidr(input);
  if (isParseError(result)) throw new Error(`expected ${input} to parse, got ${result.code}`);
  return result.value;
}

const show = (cidr: Cidr, address: number | bigint): string =>
  formatAddressValue(cidr.family, address);

describe('networkOf / lastAddressOf', () => {
  it.each([
    ['192.168.1.37/24', '192.168.1.0', '192.168.1.255'],
    ['10.0.0.0/8', '10.0.0.0', '10.255.255.255'],
    ['0.0.0.0/0', '0.0.0.0', '255.255.255.255'],
    ['203.0.113.9/32', '203.0.113.9', '203.0.113.9'],
    ['198.51.100.6/31', '198.51.100.6', '198.51.100.7'],
    ['2001:db8::1/48', '2001:db8::', '2001:db8:0:ffff:ffff:ffff:ffff:ffff'],
    ['::/0', '::', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
    ['2001:db8::1/128', '2001:db8::1', '2001:db8::1'],
  ])('%s spans %s … %s', (input, network, last) => {
    const cidr = block(input);
    expect(show(cidr, networkAddressOf(cidr))).toBe(network);
    expect(show(cidr, lastAddressOf(cidr))).toBe(last);
  });

  it('rebases a block onto its network address', () => {
    expect(formatCidr(networkOf(block('192.168.1.37/24')))).toBe('192.168.1.0/24');
    expect(formatCidr(networkOf(block('2001:db8::1/48')))).toBe('2001:db8::/48');
  });

  it('exposes the IPv4 broadcast under the name engineers expect', () => {
    const cidr = block('192.168.1.0/24') as Cidr4;
    expect(show(cidr, broadcastOf(cidr))).toBe('192.168.1.255');
  });
});

describe('totalAddresses', () => {
  it.each<[string, bigint]>([
    ['10.0.0.0/8', 16777216n],
    ['192.168.1.0/24', 256n],
    ['192.168.1.0/30', 4n],
    ['192.168.1.0/31', 2n],
    ['192.168.1.1/32', 1n],
    ['0.0.0.0/0', 4294967296n],
    ['2001:db8::/64', 18446744073709551616n],
    ['2001:db8::/127', 2n],
    ['2001:db8::/128', 1n],
    ['::/0', 340282366920938463463374607431768211456n],
  ])('%s spans %s addresses', (input, expected) => {
    expect(totalAddresses(block(input))).toBe(expected);
  });
});

describe('usableRange (spec §4.4)', () => {
  it('reserves network and broadcast for /30 and shorter', () => {
    const cidr = block('192.168.1.0/24');
    const range = usableRange(cidr);
    expect(show(cidr, range.first)).toBe('192.168.1.1');
    expect(show(cidr, range.last)).toBe('192.168.1.254');
    expect(range.count).toBe(254n);
  });

  it('handles /0', () => {
    const cidr = block('0.0.0.0/0');
    const range = usableRange(cidr);
    expect(show(cidr, range.first)).toBe('0.0.0.1');
    expect(show(cidr, range.last)).toBe('255.255.255.254');
    expect(range.count).toBe(4294967294n);
  });

  it('gives a /30 exactly two usable hosts', () => {
    const cidr = block('192.168.1.4/30');
    const range = usableRange(cidr);
    expect(show(cidr, range.first)).toBe('192.168.1.5');
    expect(show(cidr, range.last)).toBe('192.168.1.6');
    expect(range.count).toBe(2n);
  });

  it('treats a /31 as an RFC 3021 point-to-point link — nothing reserved', () => {
    const cidr = block('198.51.100.6/31');
    const range = usableRange(cidr);
    expect(show(cidr, range.first)).toBe('198.51.100.6');
    expect(show(cidr, range.last)).toBe('198.51.100.7');
    expect(range.count).toBe(2n);
  });

  it('treats a /32 as a host route', () => {
    const cidr = block('203.0.113.9/32');
    const range = usableRange(cidr);
    expect(range.first).toBe(range.last);
    expect(range.count).toBe(1n);
  });

  it.each<[string, bigint]>([
    ['2001:db8::/64', 18446744073709551616n],
    ['2001:db8::/127', 2n],
    ['2001:db8::1/128', 1n],
  ])('counts every IPv6 address in %s as usable', (input, expected) => {
    const cidr = block(input);
    const range = usableRange(cidr);
    expect(range.count).toBe(expected);
    expect(range.count).toBe(totalAddresses(cidr));
    expect(range.first).toBe(networkAddressOf(cidr));
    expect(range.last).toBe(lastAddressOf(cidr));
  });
});

describe('contains / relationOf', () => {
  it.each<[string, string, boolean]>([
    ['10.0.0.0/8', '10.1.0.0/16', true],
    ['10.0.0.0/8', '10.0.0.0/8', true],
    ['10.1.0.0/16', '10.0.0.0/8', false],
    ['10.0.0.0/8', '11.0.0.0/8', false],
    ['0.0.0.0/0', '203.0.113.0/24', true],
    ['2001:db8::/32', '2001:db8:1::/48', true],
    ['2001:db8::/32', '2001:db9::/32', false],
    ['10.0.0.0/8', '2001:db8::/32', false],
  ])('contains(%s, %s) === %s', (a, b, expected) => {
    expect(contains(block(a), block(b))).toBe(expected);
  });

  it.each<[string, string, string]>([
    ['10.0.0.0/8', '10.0.0.0/8', 'identical'],
    ['10.0.0.0/8', '10.1.0.0/16', 'a-contains-b'],
    ['10.1.0.0/16', '10.0.0.0/8', 'b-contains-a'],
    ['10.0.0.0/8', '11.0.0.0/8', 'disjoint'],
    ['10.0.0.0/8', '192.168.0.0/16', 'disjoint'],
    ['10.0.0.0/8', '2001:db8::/32', 'disjoint'],
    ['2001:db8::/32', '2001:db8:1::/48', 'a-contains-b'],
    ['2001:db8:1::/48', '2001:db8::/32', 'b-contains-a'],
    ['2001:db8::/32', '2001:db8::/32', 'identical'],
    ['2001:db8::/48', '2001:db9::/48', 'disjoint'],
  ])('relationOf(%s, %s) === %s', (a, b, expected) => {
    expect(relationOf(block(a), block(b))).toBe(expected);
  });

  it('treats blocks written with host bits as their network', () => {
    expect(relationOf(block('10.1.2.3/8'), block('10.0.0.0/8'))).toBe('identical');
  });
});

describe('splitOnce', () => {
  it.each<[string, string, string]>([
    ['10.0.0.0/8', '10.0.0.0/9', '10.128.0.0/9'],
    ['10.20.0.0/16', '10.20.0.0/17', '10.20.128.0/17'],
    ['0.0.0.0/0', '0.0.0.0/1', '128.0.0.0/1'],
    ['192.168.1.0/30', '192.168.1.0/31', '192.168.1.2/31'],
    ['2001:db8::/32', '2001:db8::/33', '2001:db8:8000::/33'],
    ['2001:db8::/126', '2001:db8::/127', '2001:db8::2/127'],
  ])('splits %s into %s and %s', (input, left, right) => {
    const result = splitOnce(block(input));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map(formatCidr)).toEqual([left, right]);
    }
  });

  it('splits from the network address even when host bits were entered', () => {
    const result = splitOnce(block('10.20.30.40/16'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(formatCidr(result.value[0])).toBe('10.20.0.0/17');
  });

  it.each([['10.0.0.1/32'], ['2001:db8::1/128']])('refuses to split %s', (input) => {
    const result = splitOnce(block(input));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('AT_MAX_PREFIX');
  });
});

describe('compareCidr', () => {
  it('orders IPv4 before IPv6, then by address, then by prefix', () => {
    const sorted = [
      '2001:db8::/32',
      '10.1.0.0/16',
      '10.0.0.0/16',
      '10.0.0.0/8',
      '::/0',
    ]
      .map(block)
      .sort(compareCidr)
      .map(formatCidr);

    expect(sorted).toEqual(['10.0.0.0/8', '10.0.0.0/16', '10.1.0.0/16', '::/0', '2001:db8::/32']);
  });
});

describe('prefixForSize', () => {
  it.each<[4 | 6, bigint, number]>([
    [4, 1n, 32],
    [4, 2n, 31],
    [4, 128n, 25],
    [4, 4294967296n, 0],
    [6, 1n, 128],
    [6, 18446744073709551616n, 64],
  ])('IPv%i block of %s addresses is a /%i', (family, size, prefix) => {
    expect(prefixForSize(family, size)).toBe(prefix);
  });
});
