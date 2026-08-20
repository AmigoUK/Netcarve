/**
 * IPv6 primitives.
 *
 * An IPv6 address is a native `bigint` in the range `0n … 2n**128n - 1n`. Parsing follows
 * RFC 4291 (at most one `::`, optional embedded IPv4 tail, case-insensitive) and formatting
 * follows RFC 5952 §4 to the letter.
 */

import { fail, ok, type ParseError, type ParseResult, type Warning, warn } from '../errors';
import { parseIPv4 } from './v4';

export const V6_BITS = 128;
export const MAX128 = (1n << 128n) - 1n;

const GROUP_PATTERN = /^[0-9a-f]{1,4}$/;
const GROUP_COUNT = 8;

/** Splits on `:` but treats an empty string as "no groups at all". */
function splitGroups(part: string): string[] {
  return part === '' ? [] : part.split(':');
}

/**
 * Rewrites a trailing embedded IPv4 literal (`::ffff:192.0.2.1`) into two hex groups.
 * Returns the rewritten string, or a `ParseError` when the dotted part is not a well-formed
 * IPv4 literal sitting in the final position.
 */
function foldIPv4Tail(text: string): string | ParseError {
  const lastColon = text.lastIndexOf(':');
  if (lastColon === -1) {
    return fail('BAD_FORM', 'That looks like an IPv4 address, not an IPv6 one.', text);
  }
  const tail = text.slice(lastColon + 1);
  if (!tail.includes('.')) {
    return fail(
      'BAD_FORM',
      'An embedded IPv4 address may only appear at the end of an IPv6 address.',
      text,
    );
  }
  const embedded = parseIPv4(tail);
  if (!embedded.ok) return embedded;

  const high = (embedded.value >>> 16).toString(16);
  const low = (embedded.value & 0xffff).toString(16);
  return `${text.slice(0, lastColon + 1)}${high}:${low}`;
}

/** Full RFC 4291 parser. A zone ID is stripped and reported as a warning, never an error. */
export function parseIPv6(input: string): ParseResult<bigint> {
  if (input.trim() === '') {
    return fail('EMPTY', 'Enter an IPv6 address.');
  }

  const warnings: Warning[] = [];
  let text = input.toLowerCase();

  const percent = text.indexOf('%');
  if (percent !== -1) {
    const zone = text.slice(percent + 1);
    if (zone === '') {
      return fail('BAD_FORM', 'A zone ID must name an interface, for example %eth0.', input);
    }
    warnings.push(
      warn('ZONE_ID_STRIPPED', `Zone ID “%${zone}” ignored — it is not part of the address.`),
    );
    text = text.slice(0, percent);
  }

  if (text.includes('.')) {
    const folded = foldIPv4Tail(text);
    if (typeof folded !== 'string') return folded;
    text = folded;
  }

  const halves = text.split('::');
  if (halves.length > 2) {
    return fail('DOUBLE_COMPRESSION', 'An IPv6 address may use “::” only once.', input);
  }

  const compressed = halves.length === 2;
  const head = splitGroups(halves[0] as string);
  const tail = compressed ? splitGroups(halves[1] as string) : [];

  for (const group of [...head, ...tail]) {
    if (!GROUP_PATTERN.test(group)) {
      return fail('BAD_GROUP', 'Each group must be one to four hexadecimal digits.', group);
    }
  }

  const given = head.length + tail.length;
  if (compressed) {
    // “::” must stand in for at least one group of zeros.
    if (given >= GROUP_COUNT) {
      return fail(
        'TOO_MANY_GROUPS',
        'Remove the “::” — the address already has all eight groups.',
        input,
      );
    }
  } else if (given > GROUP_COUNT) {
    return fail('TOO_MANY_GROUPS', 'An IPv6 address has at most eight groups.', input);
  } else if (given < GROUP_COUNT) {
    return fail(
      'TOO_FEW_GROUPS',
      'An IPv6 address needs eight groups, or “::” to stand in for the missing ones.',
      input,
    );
  }

  const groups = [
    ...head,
    ...new Array<string>(GROUP_COUNT - given).fill('0'),
    ...tail,
  ];

  let address = 0n;
  for (const group of groups) {
    address = (address << 16n) | BigInt(Number.parseInt(group, 16));
  }
  return ok(address, warnings);
}

/** The eight 16-bit groups of an address, as numbers. */
function groupsOf(address: bigint): number[] {
  const groups: number[] = [];
  for (let index = 0; index < GROUP_COUNT; index += 1) {
    groups.push(Number((address >> BigInt(112 - index * 16)) & 0xffffn));
  }
  return groups;
}

/**
 * RFC 5952 canonical form: lowercase hex, no leading zeros inside a group, and the longest
 * run of two or more zero groups replaced by `::` (leftmost run on a tie).
 */
export function formatIPv6(address: bigint): string {
  const groups = groupsOf(address);

  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  for (let index = 0; index <= GROUP_COUNT; index += 1) {
    const isZero = index < GROUP_COUNT && groups[index] === 0;
    if (isZero) {
      if (runStart === -1) runStart = index;
    } else if (runStart !== -1) {
      const length = index - runStart;
      // Strictly greater keeps the leftmost run when two runs tie.
      if (length >= 2 && length > bestLength) {
        bestStart = runStart;
        bestLength = length;
      }
      runStart = -1;
    }
  }

  const hex = groups.map((group) => group.toString(16));
  if (bestStart === -1) return hex.join(':');

  const head = hex.slice(0, bestStart).join(':');
  const tail = hex.slice(bestStart + bestLength).join(':');
  return `${head}::${tail}`;
}

/** The fully expanded form: eight groups of four hex digits. */
export function expandIPv6(address: bigint): string {
  return groupsOf(address)
    .map((group) => group.toString(16).padStart(4, '0'))
    .join(':');
}

/** The contiguous network mask for a prefix length of 0–128. */
export function maskV6(prefix: number): bigint {
  if (prefix === 0) return 0n;
  const hostBits = BigInt(V6_BITS - prefix);
  return (MAX128 >> hostBits) << hostBits;
}
