/**
 * The `Cidr` value type and the front-door parser every view uses.
 *
 * `Cidr` is modelled as a discriminated union on `family` so that TypeScript narrows
 * `address` to `number` for IPv4 and `bigint` for IPv6; the shape is otherwise exactly the
 * one given in the specification §4.1.
 */

import { fail, ok, type ParseResult, type Warning, warn } from './errors';
import { formatIPv4, parseIPv4, parseV4Mask } from './v4';
import { formatIPv6, maskV6, parseIPv6 } from './v6';

export type IpFamily = 4 | 6;

export interface Cidr4 {
  readonly family: 4;
  /** The address exactly as entered — not necessarily the network address. */
  readonly address: number;
  /** 0–32. */
  readonly prefix: number;
}

export interface Cidr6 {
  readonly family: 6;
  /** The address exactly as entered — not necessarily the network address. */
  readonly address: bigint;
  /** 0–128. */
  readonly prefix: number;
}

export type Cidr = Cidr4 | Cidr6;

/** Address width in bits for a family. */
export function bitsOf(family: IpFamily): number {
  return family === 4 ? 32 : 128;
}

/** Renders a bare address value, given the family it belongs to. */
export function formatAddressValue(family: IpFamily, address: number | bigint): string {
  return family === 4 ? formatIPv4(address as number) : formatIPv6(address as bigint);
}

/** Renders just the address part of a block. */
export function formatAddress(cidr: Cidr): string {
  return formatAddressValue(cidr.family, cidr.address);
}

/** Renders a block as `address/prefix`, using the address exactly as it is held. */
export function formatCidr(cidr: Cidr): string {
  return `${formatAddress(cidr)}/${cidr.prefix}`;
}

/** Builds a block, narrowing the address type to the family. */
export function makeCidr(family: 4, address: number, prefix: number): Cidr4;
export function makeCidr(family: 6, address: bigint, prefix: number): Cidr6;
export function makeCidr(family: IpFamily, address: number | bigint, prefix: number): Cidr {
  return family === 4
    ? { family: 4, address: (address as number) >>> 0, prefix }
    : { family: 6, address: address as bigint, prefix };
}

function parsePrefix(text: string, family: IpFamily): ParseResult<number> {
  if (!/^\d{1,3}$/.test(text)) {
    return fail('BAD_PREFIX', 'A prefix length must be a plain number after the slash.', text);
  }
  const prefix = Number(text);
  if (prefix > bitsOf(family)) {
    return fail(
      'BAD_PREFIX',
      `An IPv${family} prefix length must be between 0 and ${bitsOf(family)}.`,
      text,
    );
  }
  return ok(prefix);
}

/** True when the address carries bits below the prefix boundary. */
function hasHostBits(family: IpFamily, address: number | bigint, prefix: number): boolean {
  if (family === 4) {
    const hostBits = 32 - prefix;
    return hostBits > 0 && (((address as number) << prefix) >>> 0) !== 0;
  }
  return ((address as bigint) & ~maskV6(prefix) & ((1n << 128n) - 1n)) !== 0n;
}

/**
 * Parses everything the calculator accepts:
 *
 * - `10.0.0.0/8`, `2001:db8::/48`
 * - `10.0.0.0 255.255.255.0` and `10.0.0.0/255.255.255.0` (IPv4 only, contiguous masks)
 * - a bare address, which becomes `/32` or `/128` with an `ASSUMED_HOST_PREFIX` warning
 *
 * Surrounding whitespace is trimmed before parsing, so a pasted value with a trailing space
 * still works; whitespace *inside* the address itself is still rejected.
 */
export function parseCidr(input: string): ParseResult<Cidr> {
  const text = input.trim();
  if (text === '') {
    return fail('EMPTY', 'Enter an IP address or CIDR block.');
  }

  const warnings: Warning[] = [];
  const family: IpFamily = text.includes(':') ? 6 : 4;

  // Split `addr mask` and `addr/prefix` into an address part and an optional suffix.
  const spaced = text.split(/\s+/);
  let addressPart: string;
  let suffix: string | undefined;

  if (spaced.length > 2) {
    return fail('BAD_FORM', 'Enter an address, optionally followed by a prefix or a mask.', text);
  }
  if (spaced.length === 2) {
    addressPart = spaced[0] as string;
    suffix = spaced[1] as string;
  } else {
    const slashed = (spaced[0] as string).split('/');
    if (slashed.length > 2) {
      return fail('BAD_FORM', 'A CIDR block has a single slash.', text);
    }
    addressPart = slashed[0] as string;
    suffix = slashed[1];
  }

  let prefix: number;
  if (suffix === undefined) {
    prefix = bitsOf(family);
    warnings.push(
      warn(
        'ASSUMED_HOST_PREFIX',
        `No prefix given — treating this as a single host, /${prefix}.`,
      ),
    );
  } else if (suffix.includes('.') && !suffix.includes(':')) {
    if (family === 6) {
      return fail(
        'MASK_NOT_SUPPORTED',
        'IPv6 uses prefix lengths, not dotted masks. Try /64.',
        suffix,
      );
    }
    const mask = parseV4Mask(suffix);
    if (!mask.ok) return mask;
    prefix = mask.value;
  } else {
    const parsed = parsePrefix(suffix, family);
    if (!parsed.ok) return parsed;
    prefix = parsed.value;
  }

  if (family === 4) {
    const address = parseIPv4(addressPart);
    if (!address.ok) return address;
    if (hasHostBits(4, address.value, prefix)) {
      warnings.push(
        warn('HOST_BITS_SET', 'The input was a host address within this network.'),
      );
    }
    return ok(makeCidr(4, address.value, prefix), [...address.warnings, ...warnings]);
  }

  const address = parseIPv6(addressPart);
  if (!address.ok) return address;
  if (hasHostBits(6, address.value, prefix)) {
    warnings.push(warn('HOST_BITS_SET', 'The input was a host address within this network.'));
  }
  return ok(makeCidr(6, address.value, prefix), [...address.warnings, ...warnings]);
}
