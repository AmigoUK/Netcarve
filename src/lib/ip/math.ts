/**
 * Block arithmetic: network and last addresses, usable ranges, totals, containment and
 * splitting.
 *
 * **Alignment invariant.** A CIDR block always starts on a multiple of its own size, so any
 * two blocks are either disjoint or one wholly contains the other — partial overlap is
 * arithmetically impossible. `relationOf` relies on this, which is why it only ever has to
 * answer with `identical`, `a-contains-b`, `b-contains-a` or `disjoint`.
 */

import {
  bitsOf,
  makeCidr,
  type Cidr,
  type Cidr4,
  type Cidr6,
  type IpFamily,
} from './cidr';
import { fail, ok, type ParseResult } from './errors';
import { maskV4, V4_MAX } from './v4';
import { maskV6 } from './v6';

export type CidrRelation = 'identical' | 'a-contains-b' | 'b-contains-a' | 'disjoint';

export interface UsableRange {
  /** First usable address, as a raw value in the block's family. */
  readonly first: number | bigint;
  /** Last usable address, as a raw value in the block's family. */
  readonly last: number | bigint;
  /** How many addresses are usable. */
  readonly count: bigint;
}

/** The network address of a block, as a raw value. */
export function networkAddressOf(cidr: Cidr4): number;
export function networkAddressOf(cidr: Cidr6): bigint;
export function networkAddressOf(cidr: Cidr): number | bigint;
export function networkAddressOf(cidr: Cidr): number | bigint {
  return cidr.family === 4
    ? (cidr.address & maskV4(cidr.prefix)) >>> 0
    : cidr.address & maskV6(cidr.prefix);
}

/** The block rebased onto its own network address. */
export function networkOf(cidr: Cidr4): Cidr4;
export function networkOf(cidr: Cidr6): Cidr6;
export function networkOf(cidr: Cidr): Cidr;
export function networkOf(cidr: Cidr): Cidr {
  return cidr.family === 4
    ? makeCidr(4, networkAddressOf(cidr), cidr.prefix)
    : makeCidr(6, networkAddressOf(cidr), cidr.prefix);
}

/**
 * The highest address in the block. For IPv4 this is the broadcast address; for IPv6 it is
 * simply the last address — IPv6 has no broadcast and the UI must never call it one.
 */
export function lastAddressOf(cidr: Cidr4): number;
export function lastAddressOf(cidr: Cidr6): bigint;
export function lastAddressOf(cidr: Cidr): number | bigint;
export function lastAddressOf(cidr: Cidr): number | bigint {
  if (cidr.family === 4) {
    return (networkAddressOf(cidr) | (~maskV4(cidr.prefix) & V4_MAX)) >>> 0;
  }
  return networkAddressOf(cidr) | (~maskV6(cidr.prefix) & ((1n << 128n) - 1n));
}

/** IPv4-only alias, so views can use the term engineers expect. */
export function broadcastOf(cidr: Cidr4): number {
  return lastAddressOf(cidr);
}

/** How many addresses the block spans, for either family. */
export function totalAddresses(cidr: Cidr): bigint {
  return 1n << BigInt(bitsOf(cidr.family) - cidr.prefix);
}

/**
 * The usable host range, following spec §4.4:
 *
 * - IPv4 `/32` — one address, first === last (a host route).
 * - IPv4 `/31` — both addresses usable (RFC 3021 point-to-point); nothing is reserved.
 * - IPv4 `/30` and shorter — network and broadcast are reserved, so usable = total − 2.
 * - IPv6 — every address is usable; subnet-router anycast is a footnote, never subtracted.
 */
export function usableRange(cidr: Cidr): UsableRange {
  const total = totalAddresses(cidr);

  if (cidr.family === 6) {
    return { first: networkAddressOf(cidr), last: lastAddressOf(cidr), count: total };
  }

  const network = networkAddressOf(cidr);
  const last = lastAddressOf(cidr);
  if (cidr.prefix >= 31) {
    return { first: network, last, count: total };
  }
  return { first: (network + 1) >>> 0, last: (last - 1) >>> 0, count: total - 2n };
}

/** True iff `b` lies wholly within `a`. Blocks of different families never contain each other. */
export function contains(a: Cidr, b: Cidr): boolean {
  if (a.family !== b.family) return false;
  if (a.prefix > b.prefix) return false;
  if (a.family === 4) {
    const mask = maskV4(a.prefix);
    return ((a.address & mask) >>> 0) === (((b as Cidr4).address & mask) >>> 0);
  }
  const mask = maskV6(a.prefix);
  return (a.address & mask) === ((b as Cidr6).address & mask);
}

/** Classifies two blocks. See the alignment invariant at the top of this module. */
export function relationOf(a: Cidr, b: Cidr): CidrRelation {
  if (a.family !== b.family) return 'disjoint';
  if (a.prefix === b.prefix) {
    return networkAddressOf(a) === networkAddressOf(b) ? 'identical' : 'disjoint';
  }
  if (contains(a, b)) return 'a-contains-b';
  if (contains(b, a)) return 'b-contains-a';
  return 'disjoint';
}

/** The two child blocks one prefix bit longer. Fails when the block is already a single host. */
export function splitOnce(cidr: Cidr): ParseResult<[Cidr, Cidr]> {
  const maxPrefix = bitsOf(cidr.family);
  if (cidr.prefix >= maxPrefix) {
    return fail(
      'AT_MAX_PREFIX',
      `A /${maxPrefix} is a single address — there is nothing left to split.`,
    );
  }

  const childPrefix = cidr.prefix + 1;
  if (cidr.family === 4) {
    const network = networkAddressOf(cidr);
    const step = 2 ** (32 - childPrefix);
    return ok([
      makeCidr(4, network, childPrefix),
      makeCidr(4, (network + step) >>> 0, childPrefix),
    ]);
  }
  const network = networkAddressOf(cidr);
  const step = 1n << BigInt(128 - childPrefix);
  return ok([makeCidr(6, network, childPrefix), makeCidr(6, network + step, childPrefix)]);
}

/** Sort order: IPv4 before IPv6, then by network address, then shortest prefix first. */
export function compareCidr(a: Cidr, b: Cidr): number {
  if (a.family !== b.family) return a.family - b.family;
  const left = BigInt(networkAddressOf(a));
  const right = BigInt(networkAddressOf(b));
  if (left < right) return -1;
  if (left > right) return 1;
  return a.prefix - b.prefix;
}

/** The prefix length that exactly spans `size` addresses, for the given family. */
export function prefixForSize(family: IpFamily, size: bigint): number {
  let bits = 0;
  let remaining = size;
  while (remaining > 1n) {
    remaining >>= 1n;
    bits += 1;
  }
  return bitsOf(family) - bits;
}
