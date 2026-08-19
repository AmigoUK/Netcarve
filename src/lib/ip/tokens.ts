/**
 * Finds IP addresses and CIDR blocks inside free text — the input side of the context menu
 * (F6), where the user's selection may be a whole sentence, a config fragment or a table cell.
 *
 * The regular expressions below only produce *candidates*: every candidate is then validated
 * through `parseCidr`, so a near-miss such as `999.1.1.1`, a MAC address or a timestamp is
 * discarded rather than reported. When a candidate with a suffix fails, the bare address is
 * retried, so `10.0.0.1 10.0.0.2` still yields the first address instead of nothing.
 */

import { parseCidr, type Cidr } from './cidr';

export interface FoundToken {
  /** The token exactly as it appeared in the source text. */
  readonly text: string;
  /** Character offset of the token within the source text. */
  readonly index: number;
  /** The parsed block. */
  readonly cidr: Cidr;
}

/**
 * `a.b.c.d` optionally followed by `/prefix` or a whitespace-separated dotted mask.
 * The trailing guard rejects `1.2.3.4000` while still allowing a sentence-ending full stop.
 */
const V4_CANDIDATE =
  /(?<![0-9A-Za-z.])(\d{1,3}(?:\.\d{1,3}){3})((?:\/\d{1,3})|(?:[ \t]+\d{1,3}(?:\.\d{1,3}){3}))?(?![0-9A-Za-z])(?!\.\d)/g;

/** Two to eight colon-separated hex groups, with an optional IPv4 tail, zone ID and prefix. */
const V6_CANDIDATE =
  /(?<![0-9A-Za-z.:])((?:[0-9A-Fa-f]{1,4})?(?::[0-9A-Fa-f]{0,4}){2,7}(?:\.\d{1,3}){0,3}(?:%[0-9A-Za-z._-]+)?)(\/\d{1,3})?(?![0-9A-Za-z:])(?!\.\d)/g;

interface Candidate {
  index: number;
  address: string;
  suffix: string;
}

function collect(pattern: RegExp, text: string, into: Candidate[]): void {
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const address = match[1] as string;
    const suffix = match[2] ?? '';
    into.push({ index: match.index, address, suffix });

    // `10.0.0.1 10.0.0.2` matches as an address-and-mask pair, but it is really two
    // addresses. Offer the second one as its own candidate; it is only reached when the
    // pair fails to validate as a mask, because a successful pair consumes both.
    const pair = /^([ \t]+)(\S+)$/.exec(suffix);
    if (pair !== null) {
      into.push({
        index: match.index + address.length + (pair[1] as string).length,
        address: pair[2] as string,
        suffix: '',
      });
    }
  }
}

/**
 * Returns every valid address or block found in `text`, in order of appearance.
 * The first element is what the context menu hands to the calculator.
 */
export function findIpTokens(text: string): FoundToken[] {
  const candidates: Candidate[] = [];
  collect(V6_CANDIDATE, text, candidates);
  collect(V4_CANDIDATE, text, candidates);
  candidates.sort((a, b) => a.index - b.index);

  const tokens: FoundToken[] = [];
  let consumedTo = 0;

  for (const candidate of candidates) {
    if (candidate.index < consumedTo) continue;

    const full = candidate.address + candidate.suffix;
    const withSuffix = parseCidr(full);
    if (withSuffix.ok) {
      tokens.push({ text: full, index: candidate.index, cidr: withSuffix.value });
      consumedTo = candidate.index + full.length;
      continue;
    }

    if (candidate.suffix !== '') {
      const bare = parseCidr(candidate.address);
      if (bare.ok) {
        tokens.push({ text: candidate.address, index: candidate.index, cidr: bare.value });
        consumedTo = candidate.index + candidate.address.length;
      }
    }
  }

  return tokens;
}
