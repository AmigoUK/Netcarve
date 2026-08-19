/**
 * Special-range intelligence (spec §4.3).
 *
 * Two constant tables are matched by longest-prefix against the **network address** of the
 * input, so every applicable entry is reported, most specific first. Deprecated ranges carry
 * a flag the UI renders as a badge.
 */

import { parseCidr, type Cidr, type IpFamily } from './cidr';
import { networkAddressOf } from './math';
import { maskV4 } from './v4';
import { maskV6 } from './v6';

export interface SpecialRange {
  /** The reserved block, in canonical form. */
  readonly cidr: string;
  /** Short title, shown on the badge. */
  readonly label: string;
  /** One-line explanation, shown as the badge's tooltip or supporting copy. */
  readonly shortNote: string;
  /** Set when the allocation has been deprecated by a later RFC. */
  readonly deprecated?: true;
}

export const IPV4_SPECIAL: readonly SpecialRange[] = [
  {
    cidr: '0.0.0.0/8',
    label: '"This network" (RFC 791)',
    shortNote: 'Valid only as a source address while a host is still learning its own address.',
  },
  {
    cidr: '10.0.0.0/8',
    label: 'Private (RFC 1918)',
    shortNote: 'Private internet; never routed across the public internet.',
  },
  {
    cidr: '100.64.0.0/10',
    label: 'Shared address space / CGNAT (RFC 6598)',
    shortNote: 'Used between a subscriber and a carrier-grade NAT. Avoid inside a client LAN.',
  },
  {
    cidr: '127.0.0.0/8',
    label: 'Loopback',
    shortNote: 'Never leaves the host.',
  },
  {
    cidr: '169.254.0.0/16',
    label: 'Link-local / APIPA (RFC 3927)',
    shortNote: 'Self-assigned when DHCP fails; usually a symptom rather than a plan.',
  },
  {
    cidr: '172.16.0.0/12',
    label: 'Private (RFC 1918)',
    shortNote: 'Private internet; never routed across the public internet.',
  },
  {
    cidr: '192.0.0.0/24',
    label: 'IETF protocol assignments',
    shortNote: 'Reserved for protocol machinery such as DS-Lite and NAT64 discovery.',
  },
  {
    cidr: '192.0.2.0/24',
    label: 'Documentation TEST-NET-1',
    shortNote: 'Safe to use in examples and client documentation.',
  },
  {
    cidr: '192.88.99.0/24',
    label: '6to4 relay anycast',
    shortNote: 'Deprecated by RFC 7526. Do not use in new designs.',
    deprecated: true,
  },
  {
    cidr: '192.168.0.0/16',
    label: 'Private (RFC 1918)',
    shortNote: 'Private internet; the default range on most consumer routers.',
  },
  {
    cidr: '198.18.0.0/15',
    label: 'Benchmarking (RFC 2544)',
    shortNote: 'Reserved for network device benchmarking.',
  },
  {
    cidr: '198.51.100.0/24',
    label: 'Documentation TEST-NET-2',
    shortNote: 'Safe to use in examples and client documentation.',
  },
  {
    cidr: '203.0.113.0/24',
    label: 'Documentation TEST-NET-3',
    shortNote: 'Safe to use in examples and client documentation.',
  },
  {
    cidr: '224.0.0.0/4',
    label: 'Multicast',
    shortNote: 'Group addressing; not assignable to an interface as a unicast address.',
  },
  {
    cidr: '240.0.0.0/4',
    label: 'Reserved (former Class E)',
    shortNote: 'Reserved for future use; most stacks refuse to route it.',
  },
  {
    cidr: '255.255.255.255/32',
    label: 'Limited broadcast',
    shortNote: 'Reaches every host on the local link only.',
  },
];

export const IPV6_SPECIAL: readonly SpecialRange[] = [
  { cidr: '::/128', label: 'Unspecified', shortNote: 'The "no address yet" placeholder.' },
  { cidr: '::1/128', label: 'Loopback', shortNote: 'Never leaves the host.' },
  {
    cidr: '::ffff:0:0/96',
    label: 'IPv4-mapped',
    shortNote: 'Carries an IPv4 address inside an IPv6 socket API.',
  },
  {
    cidr: '64:ff9b::/96',
    label: 'NAT64 well-known prefix (RFC 6052)',
    shortNote: 'Translates IPv4 destinations for IPv6-only clients.',
  },
  {
    cidr: '64:ff9b:1::/48',
    label: 'Local-use NAT64 (RFC 8215)',
    shortNote: 'For NAT64 deployments that need a local prefix.',
  },
  {
    cidr: '100::/64',
    label: 'Discard-only (RFC 6666)',
    shortNote: 'A black hole for traffic you want dropped without an ICMP reply.',
  },
  {
    cidr: '2000::/3',
    label: 'Global unicast',
    shortNote: 'The public, globally routable IPv6 space.',
  },
  { cidr: '2001::/32', label: 'Teredo', shortNote: 'IPv6 tunnelled over UDP through NAT.' },
  {
    cidr: '2001:db8::/32',
    label: 'Documentation',
    shortNote: 'Safe to use in examples and client documentation.',
  },
  {
    cidr: '3fff::/20',
    label: 'Documentation (RFC 9637)',
    shortNote: 'A newer, larger documentation range.',
  },
  {
    cidr: '2002::/16',
    label: '6to4',
    shortNote: 'Deprecated by RFC 7526. Do not use in new designs.',
    deprecated: true,
  },
  {
    cidr: '5f00::/16',
    label: 'SRv6 SIDs (RFC 9602)',
    shortNote: 'Segment identifiers for segment routing over IPv6.',
  },
  {
    cidr: 'fc00::/7',
    label: 'Unique local (ULA)',
    shortNote: 'The IPv6 equivalent of RFC 1918 space; generate the /48 randomly.',
  },
  {
    cidr: 'fe80::/10',
    label: 'Link-local',
    shortNote: 'Present on every interface; scoped to a single link.',
  },
  {
    cidr: 'fec0::/10',
    label: 'Site-local',
    shortNote: 'Deprecated by RFC 3879. Use unique local addresses instead.',
    deprecated: true,
  },
  {
    cidr: 'ff00::/8',
    label: 'Multicast',
    shortNote: 'Group addressing; not assignable as a unicast address.',
  },
];

interface CompiledRange {
  readonly range: SpecialRange;
  readonly block: Cidr;
}

function compile(table: readonly SpecialRange[]): CompiledRange[] {
  return table.map((range) => {
    const parsed = parseCidr(range.cidr);
    /* c8 ignore next 3 -- the tables are constants; this guards against a future typo. */
    if (!parsed.ok) {
      throw new Error(`NetCarve special-range table has an invalid entry: ${range.cidr}`);
    }
    return { range, block: parsed.value };
  });
}

const COMPILED: Record<IpFamily, CompiledRange[]> = {
  4: compile(IPV4_SPECIAL),
  6: compile(IPV6_SPECIAL),
};

/** True when `address` (a raw value of `family`) falls inside the compiled block. */
function coversAddress(entry: Cidr, address: number | bigint): boolean {
  if (entry.family === 4) {
    const mask = maskV4(entry.prefix);
    return ((entry.address & mask) >>> 0) === (((address as number) & mask) >>> 0);
  }
  const mask = maskV6(entry.prefix);
  return (entry.address & mask) === ((address as bigint) & mask);
}

export interface SpecialMatch {
  readonly range: SpecialRange;
  /** The reserved block itself, already parsed. */
  readonly block: Cidr;
}

/**
 * Every reserved range covering the network address of `cidr`, most specific first.
 * Returns an empty array for ordinary global unicast IPv4 space.
 */
export function lookupSpecial(cidr: Cidr): SpecialMatch[] {
  const address = networkAddressOf(cidr);
  return COMPILED[cidr.family]
    .filter((entry) => coversAddress(entry.block, address))
    .sort((a, b) => b.block.prefix - a.block.prefix)
    .map((entry) => ({ range: entry.range, block: entry.block }));
}
