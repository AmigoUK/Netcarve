import { describe, expect, it } from 'vitest';
import { parseCidr, type Cidr } from '@/src/lib/ip/cidr';
import { isParseError } from '@/src/lib/errors';
import { IPV4_SPECIAL, IPV6_SPECIAL, lookupSpecial } from '@/src/lib/ip/special';

function block(input: string): Cidr {
  const result = parseCidr(input);
  if (isParseError(result)) throw new Error(`expected ${input} to parse, got ${result.code}`);
  return result.value;
}

const labels = (input: string): string[] =>
  lookupSpecial(block(input)).map((match) => match.range.label);

describe('the tables', () => {
  it('carry the full v1.0 IPv4 list', () => {
    expect(IPV4_SPECIAL).toHaveLength(16);
    expect(IPV4_SPECIAL.map((entry) => entry.cidr)).toEqual([
      '0.0.0.0/8',
      '10.0.0.0/8',
      '100.64.0.0/10',
      '127.0.0.0/8',
      '169.254.0.0/16',
      '172.16.0.0/12',
      '192.0.0.0/24',
      '192.0.2.0/24',
      '192.88.99.0/24',
      '192.168.0.0/16',
      '198.18.0.0/15',
      '198.51.100.0/24',
      '203.0.113.0/24',
      '224.0.0.0/4',
      '240.0.0.0/4',
      '255.255.255.255/32',
    ]);
  });

  it('carry the full v1.0 IPv6 list', () => {
    expect(IPV6_SPECIAL).toHaveLength(16);
    expect(IPV6_SPECIAL.map((entry) => entry.cidr)).toEqual([
      '::/128',
      '::1/128',
      '::ffff:0:0/96',
      '64:ff9b::/96',
      '64:ff9b:1::/48',
      '100::/64',
      '2000::/3',
      '2001::/32',
      '2001:db8::/32',
      '3fff::/20',
      '2002::/16',
      '5f00::/16',
      'fc00::/7',
      'fe80::/10',
      'fec0::/10',
      'ff00::/8',
    ]);
  });

  it('gives every entry a label and a note', () => {
    for (const entry of [...IPV4_SPECIAL, ...IPV6_SPECIAL]) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.shortNote.length).toBeGreaterThan(0);
    }
  });
});

describe('lookupSpecial', () => {
  it.each<[string, string[]]>([
    ['10.1.2.3/32', ['Private (RFC 1918)']],
    ['10.0.0.0/8', ['Private (RFC 1918)']],
    ['172.16.5.5/32', ['Private (RFC 1918)']],
    ['172.32.0.1/32', []],
    ['192.168.1.37/24', ['Private (RFC 1918)']],
    ['100.64.0.1/32', ['Shared address space / CGNAT (RFC 6598)']],
    ['127.0.0.1/32', ['Loopback']],
    ['169.254.1.1/32', ['Link-local / APIPA (RFC 3927)']],
    ['192.0.2.1/32', ['Documentation TEST-NET-1']],
    ['192.0.0.1/32', ['IETF protocol assignments']],
    ['198.51.100.1/32', ['Documentation TEST-NET-2']],
    ['203.0.113.1/32', ['Documentation TEST-NET-3']],
    ['198.18.0.1/32', ['Benchmarking (RFC 2544)']],
    ['224.0.0.1/32', ['Multicast']],
    ['240.0.0.1/32', ['Reserved (former Class E)']],
    // FR-INTEL-01: all matching entries, most specific first.
    ['255.255.255.255/32', ['Limited broadcast', 'Reserved (former Class E)']],
    ['0.0.0.0/8', ['"This network" (RFC 791)']],
    ['8.8.8.8/32', []],
    ['1.1.1.1/32', []],
  ])('%s matches %j', (input, expected) => {
    expect(labels(input)).toEqual(expected);
  });

  it('flags a deprecated IPv4 range', () => {
    const matches = lookupSpecial(block('192.88.99.1/32'));
    expect(matches).toHaveLength(1);
    expect(matches[0]?.range.deprecated).toBe(true);
  });

  it.each<[string, string[]]>([
    ['::/128', ['Unspecified']],
    ['::1/128', ['Loopback']],
    ['::ffff:10.0.0.1/128', ['IPv4-mapped']],
    ['64:ff9b::1/128', ['NAT64 well-known prefix (RFC 6052)']],
    ['64:ff9b:1::1/128', ['Local-use NAT64 (RFC 8215)']],
    ['100::1/128', ['Discard-only (RFC 6666)']],
    ['2001:db8::1/128', ['Documentation', 'Global unicast']],
    ['2001:db8::/48', ['Documentation', 'Global unicast']],
    ['2001::1/128', ['Teredo', 'Global unicast']],
    ['2002::1/128', ['6to4', 'Global unicast']],
    ['3fff::1/128', ['Documentation (RFC 9637)', 'Global unicast']],
    ['5f00::1/128', ['SRv6 SIDs (RFC 9602)']],
    ['fc00::1/128', ['Unique local (ULA)']],
    ['fd00::1/128', ['Unique local (ULA)']],
    ['fe80::1/128', ['Link-local']],
    ['fec0::1/128', ['Site-local']],
    ['ff02::1/128', ['Multicast']],
    ['2606:4700::1/128', ['Global unicast']],
  ])('%s matches %j', (input, expected) => {
    expect(labels(input)).toEqual(expected);
  });

  it('orders matches most specific first', () => {
    const matches = lookupSpecial(block('2001:db8::1/128'));
    expect(matches.map((match) => match.block.prefix)).toEqual([32, 3]);
  });

  it('flags a deprecated IPv6 range', () => {
    const matches = lookupSpecial(block('2002:c000:204::1/128'));
    expect(matches[0]?.range.deprecated).toBe(true);
    expect(matches[1]?.range.deprecated).toBeUndefined();
  });
});
