/**
 * The conflict checker (F5).
 *
 * Because aligned CIDR blocks cannot partially overlap, a sorted list can be swept once with a
 * stack: whatever is on top of the stack when a block arrives is its nearest container. That
 * keeps the run linear after the sort (FR-CONF-05) instead of the naive O(n²) pairwise scan.
 *
 * IPv4 and IPv6 are compared independently — the sort puts the families in separate runs and
 * `contains` never crosses them (FR-CONF-02).
 */

import { errorMessage } from '../../strings';
import { formatCidr, parseCidr, type Cidr, type IpFamily } from '../ip/cidr';
import { compareCidr, contains, networkOf } from '../ip/math';

export interface ConflictEntry {
  /** 1-based line number in the pasted text. */
  readonly line: number;
  /** The line as typed, trimmed. */
  readonly text: string;
  /** The block, rebased onto its network address. */
  readonly block: Cidr;
  /** Canonical `address/prefix`. */
  readonly cidr: string;
  readonly family: IpFamily;
}

export interface ConflictLineError {
  readonly line: number;
  readonly text: string;
  readonly message: string;
}

export interface IdenticalGroup {
  readonly cidr: string;
  readonly lines: number[];
}

export interface ContainmentChain {
  /** Outermost first, e.g. `10.0.0.0/8 ⊃ 10.1.0.0/16 ⊃ 10.1.2.0/24`. */
  readonly blocks: ReadonlyArray<{ readonly cidr: string; readonly line: number }>;
}

export interface ConflictReport {
  readonly entries: ConflictEntry[];
  readonly errors: ConflictLineError[];
  readonly identical: IdenticalGroup[];
  readonly containment: ContainmentChain[];
  /** True when nothing overlaps and nothing is duplicated. */
  readonly clean: boolean;
  /** How many distinct blocks were compared. */
  readonly blockCount: number;
}

const keyOf = (entry: ConflictEntry): string => `${entry.family}|${entry.cidr}`;

/**
 * Reads one entry per line. Blank lines and `#` comments are ignored; an unreadable line is
 * reported with its number but never aborts the run (FR-CONF-01).
 */
export function parseConflictInput(text: string): {
  entries: ConflictEntry[];
  errors: ConflictLineError[];
} {
  const entries: ConflictEntry[] = [];
  const errors: ConflictLineError[] = [];

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;
    const withoutComment = rawLine.split('#')[0] ?? '';
    const trimmed = withoutComment.trim();
    if (trimmed === '') return;

    const parsed = parseCidr(trimmed);
    if (!parsed.ok) {
      errors.push({ line, text: trimmed, message: errorMessage(parsed.code) });
      return;
    }

    const block = networkOf(parsed.value);
    entries.push({
      line,
      text: trimmed,
      block,
      cidr: formatCidr(block),
      family: block.family,
    });
  });

  return { entries, errors };
}

/** Parses and analyses a pasted list in one go. */
export function checkConflicts(text: string): ConflictReport {
  const { entries, errors } = parseConflictInput(text);

  // Duplicates first: a single pass over the entries, grouped by canonical block.
  const byBlock = new Map<string, ConflictEntry[]>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const bucket = byBlock.get(key);
    if (bucket === undefined) byBlock.set(key, [entry]);
    else bucket.push(entry);
  }

  const identical: IdenticalGroup[] = [];
  for (const bucket of byBlock.values()) {
    if (bucket.length > 1) {
      identical.push({
        cidr: (bucket[0] as ConflictEntry).cidr,
        lines: bucket.map((entry) => entry.line),
      });
    }
  }

  // One representative per distinct block, sorted by family, then address, then prefix.
  const distinct = [...byBlock.values()]
    .map((bucket) => bucket[0] as ConflictEntry)
    .sort((a, b) => compareCidr(a.block, b.block));

  const parentOf = new Map<string, ConflictEntry>();
  const hasChild = new Set<string>();
  const stack: ConflictEntry[] = [];

  for (const entry of distinct) {
    while (stack.length > 0 && !contains((stack[stack.length - 1] as ConflictEntry).block, entry.block)) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent !== undefined) {
      parentOf.set(keyOf(entry), parent);
      hasChild.add(keyOf(parent));
    }
    stack.push(entry);
  }

  // Each innermost block yields one chain, walked back up through its containers.
  const containment: ContainmentChain[] = [];
  for (const entry of distinct) {
    if (hasChild.has(keyOf(entry))) continue;
    const chain: ConflictEntry[] = [entry];
    let current = parentOf.get(keyOf(entry));
    while (current !== undefined) {
      chain.unshift(current);
      current = parentOf.get(keyOf(current));
    }
    if (chain.length > 1) {
      containment.push({
        blocks: chain.map((step) => ({ cidr: step.cidr, line: step.line })),
      });
    }
  }

  return {
    entries,
    errors,
    identical,
    containment,
    clean: identical.length === 0 && containment.length === 0,
    blockCount: distinct.length,
  };
}
