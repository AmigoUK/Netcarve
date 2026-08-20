/**
 * The calculator's view-model (F1).
 *
 * `buildCalcResult` turns a raw input string into everything the popup and the `#/calc`
 * route render: labelled fields, the bit ruler, the §4.4 notes, parser warnings and the
 * reserved-range findings. Views only lay this out; they never do arithmetic themselves,
 * which is what keeps the popup and the full app in step.
 */

import {
  bitsOf,
  formatAddressValue,
  formatCidr,
  parseCidr,
  type Cidr,
  type IpFamily,
} from '../ip/cidr';
import type { ParseErrorCode, Warning } from '../errors';
import {
  lastAddressOf,
  networkAddressOf,
  networkOf,
  totalAddresses,
  usableRange,
} from '../ip/math';
import { lookupSpecial, type SpecialMatch } from '../ip/special';
import { expandIPv6, formatIPv6 } from '../ip/v6';
import { formatIPv4, maskV4, wildcardV4 } from '../ip/v4';
import { formatCount, type CountDisplay } from '../format';
import { errorMessage, strings, warningMessage } from '../../strings';

/** One label/value pair. The same list drives the grid and the Markdown export. */
export interface CalcField {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** Addresses and counts are set in the monospace stack; prose is not. */
  readonly mono: boolean;
}

/** A cell of the bit ruler — one bit for IPv4, one 16-bit group for IPv6. */
export interface RulerCell {
  readonly text: string;
  /** How many of the cell's bits fall on the network side of the boundary. */
  readonly networkBits: number;
  readonly totalBits: number;
  /** True when the whole cell is network. */
  readonly network: boolean;
}

export interface CalcRuler {
  readonly title: string;
  readonly cells: RulerCell[];
  /** Index of the cell the prefix boundary falls after. */
  readonly boundaryAfter: number;
}

export interface CalcNote {
  readonly id: string;
  readonly text: string;
}

export interface CalcResult {
  readonly input: string;
  readonly family: IpFamily;
  /** The block exactly as entered. */
  readonly cidr: Cidr;
  /** The same block rebased onto its network address. */
  readonly network: Cidr;
  readonly prefix: number;
  readonly networkText: string;
  readonly lastAddressText: string;
  readonly rangeText: string;
  readonly usableRangeText: string;
  readonly usable: CountDisplay;
  readonly total: CountDisplay;
  /** IPv4 only. */
  readonly maskText?: string;
  readonly wildcardText?: string;
  readonly broadcastText?: string;
  /** IPv6 only. */
  readonly canonicalText?: string;
  readonly expandedText?: string;
  readonly fields: CalcField[];
  readonly ruler: CalcRuler;
  readonly notes: CalcNote[];
  readonly warnings: Warning[];
  readonly specials: SpecialMatch[];
}

export type CalcOutcome =
  | { readonly ok: true; readonly result: CalcResult }
  | { readonly ok: false; readonly code: ParseErrorCode; readonly message: string };

function rulerForV4(cidr: Cidr, network: number): CalcRuler {
  const bits = network.toString(2).padStart(32, '0').split('');
  return {
    title: strings.calc.binaryTitle,
    boundaryAfter: cidr.prefix,
    cells: bits.map((bit, index) => ({
      text: bit,
      totalBits: 1,
      networkBits: index < cidr.prefix ? 1 : 0,
      network: index < cidr.prefix,
    })),
  };
}

function rulerForV6(cidr: Cidr, network: bigint): CalcRuler {
  const groups = expandIPv6(network).split(':');
  return {
    title: strings.calc.hextetTitle,
    boundaryAfter: Math.ceil(cidr.prefix / 16),
    cells: groups.map((group, index) => {
      const networkBits = Math.min(16, Math.max(0, cidr.prefix - index * 16));
      return { text: group, totalBits: 16, networkBits, network: networkBits === 16 };
    }),
  };
}

function notesFor(cidr: Cidr, warnings: Warning[]): CalcNote[] {
  const notes: CalcNote[] = [];
  const { calc } = strings;

  if (cidr.family === 4) {
    if (cidr.prefix === 31) notes.push({ id: 'rfc3021', text: calc.notes.rfc3021 });
    if (cidr.prefix === 32) notes.push({ id: 'host-route', text: calc.notes.hostRoute });
  } else {
    if (cidr.prefix === 64) notes.push({ id: 'standard-subnet', text: calc.notes.standardSubnet });
    if (cidr.prefix === 127) notes.push({ id: 'p2p-v6', text: calc.notes.p2pV6 });
    if (cidr.prefix === 128) notes.push({ id: 'host-route', text: calc.notes.hostRoute });
    notes.push({ id: 'no-broadcast', text: calc.notes.noBroadcast });
    if (cidr.prefix < 127) notes.push({ id: 'anycast', text: calc.notes.anycast });
  }

  for (const warning of warnings) {
    notes.push({ id: warning.code, text: warningMessage(warning.code) });
  }
  return notes;
}

/** Parses `input` and assembles everything the calculator views render. */
export function buildCalcResult(input: string): CalcOutcome {
  const parsed = parseCidr(input);
  if (!parsed.ok) {
    return { ok: false, code: parsed.code, message: errorMessage(parsed.code) };
  }

  const cidr = parsed.value;
  const network = networkOf(cidr);
  const range = usableRange(cidr);
  const { fields: labels } = strings.calc;

  const show = (value: number | bigint): string => formatAddressValue(cidr.family, value);
  const networkText = show(networkAddressOf(cidr));
  const lastText = show(lastAddressOf(cidr));
  const firstUsableText = show(range.first);
  const lastUsableText = show(range.last);
  const rangeText = `${networkText} – ${lastText}`;
  const usableRangeText = `${firstUsableText} – ${lastUsableText}`;
  const usable = formatCount(range.count);
  const total = formatCount(totalAddresses(cidr));

  const fields: CalcField[] = [
    { key: 'network', label: labels.network, value: networkText, mono: true },
    { key: 'prefix', label: labels.prefix, value: `/${cidr.prefix}`, mono: true },
  ];

  const base = {
    input: input.trim(),
    family: cidr.family,
    cidr,
    network,
    prefix: cidr.prefix,
    networkText,
    lastAddressText: lastText,
    rangeText,
    usableRangeText,
    usable,
    total,
    notes: notesFor(cidr, parsed.warnings),
    warnings: parsed.warnings,
    specials: lookupSpecial(cidr),
  };

  if (cidr.family === 4) {
    const maskText = formatIPv4(maskV4(cidr.prefix));
    const wildcardText = formatIPv4(wildcardV4(cidr.prefix));
    fields.push(
      { key: 'mask', label: labels.mask, value: maskText, mono: true },
      { key: 'wildcard', label: labels.wildcard, value: wildcardText, mono: true },
      { key: 'broadcast', label: labels.broadcast, value: lastText, mono: true },
      { key: 'range', label: labels.range, value: rangeText, mono: true },
      { key: 'firstUsable', label: labels.firstUsable, value: firstUsableText, mono: true },
      { key: 'lastUsable', label: labels.lastUsable, value: lastUsableText, mono: true },
      { key: 'usable', label: labels.usable, value: usable.primary, mono: true },
      { key: 'total', label: labels.total, value: total.primary, mono: true },
    );

    return {
      ok: true,
      result: {
        ...base,
        maskText,
        wildcardText,
        broadcastText: lastText,
        fields,
        ruler: rulerForV4(cidr, networkAddressOf(cidr) as number),
      },
    };
  }

  const canonicalText = `${formatIPv6(networkAddressOf(cidr) as bigint)}/${cidr.prefix}`;
  const expandedText = expandIPv6(networkAddressOf(cidr) as bigint);
  fields.push(
    { key: 'canonical', label: labels.canonical, value: canonicalText, mono: true },
    { key: 'expanded', label: labels.expanded, value: expandedText, mono: true },
    { key: 'lastAddress', label: labels.lastAddress, value: lastText, mono: true },
    { key: 'range', label: labels.range, value: rangeText, mono: true },
    { key: 'usable', label: labels.usable, value: usable.primary, mono: true },
    { key: 'total', label: labels.total, value: total.primary, mono: true },
  );

  return {
    ok: true,
    result: {
      ...base,
      canonicalText,
      expandedText,
      fields,
      ruler: rulerForV6(cidr, networkAddressOf(cidr) as bigint),
    },
  };
}

/** Re-runs the calculator on the same address with a different prefix (FR-CALC-06). */
export function withPrefix(result: CalcResult, prefix: number): CalcOutcome {
  const clamped = Math.min(Math.max(prefix, 0), bitsOf(result.family));
  return buildCalcResult(formatCidr({ ...result.cidr, prefix: clamped } as Cidr));
}
