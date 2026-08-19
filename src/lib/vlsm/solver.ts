/**
 * The VLSM solver (F4).
 *
 * The allocation is deterministic and reproduces the algorithm in FR-VLSM-03 exactly:
 * requirements are sorted by block size descending (stable by input order), a free list starts
 * as the base network, and each requirement takes the **lowest-addressed free block that
 * fits**, split minimally until a block of exactly the right size falls out.
 */

import { formatCidr, makeCidr, parseCidr, type Cidr, type Cidr4 } from '../ip/cidr';
import { errorMessage } from '../../strings';
import { compareCidr, networkAddressOf, networkOf, splitOnce, totalAddresses } from '../ip/math';
import { describeBlock, type BlockSummary } from '../plan/describe';
import { formatPercent } from '../format';

export interface VlsmRequirement {
  readonly name: string;
  readonly requiredHosts: number;
}

export interface VlsmAllocation {
  readonly name: string;
  readonly requiredHosts: number;
  readonly block: Cidr4;
  readonly summary: BlockSummary;
  /** Usable addresses beyond what was asked for. */
  readonly waste: bigint;
}

export interface VlsmFailure {
  readonly name: string;
  /** How many more addresses the base network would have needed. */
  readonly shortfall: bigint;
}

export interface VlsmSolution {
  readonly base: Cidr4;
  /** In address order (FR-VLSM-04). */
  readonly allocations: VlsmAllocation[];
  readonly free: Cidr4[];
  readonly totalAddresses: bigint;
  readonly allocatedAddresses: bigint;
  /** Percentage of the base network handed out, to one decimal place. */
  readonly utilisation: string;
  /** Present when the base could not fit everything (FR-VLSM-05). */
  readonly failure?: VlsmFailure;
}

export type VlsmResult =
  | { readonly ok: true; readonly solution: VlsmSolution }
  | { readonly ok: false; readonly message: string };

export interface VlsmOptions {
  /** RFC 3021: size a two-host requirement as a /31 rather than a /30. */
  readonly allowSlash31?: boolean;
}

/** The smallest power of two that is at least `value`. */
function nextPowerOfTwo(value: number): number {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

/**
 * How many addresses a requirement needs (FR-VLSM-02).
 *
 * `requiredHosts + 2` covers the network and broadcast addresses, rounded up to a power of
 * two. With `/31` links enabled, a requirement of one or two hosts takes a two-address block
 * instead; without them the floor is four addresses, because a `/31` has no usable hosts under
 * the classic rules (see DECISIONS.md).
 */
export function blockSizeFor(requiredHosts: number, allowSlash31 = false): number {
  if (allowSlash31 && requiredHosts <= 2) return 2;
  return Math.max(4, nextPowerOfTwo(requiredHosts + 2));
}

/** The IPv4 prefix that spans exactly `size` addresses. */
export function prefixForBlockSize(size: number): number {
  return 32 - Math.log2(size);
}

function usableIn(size: number): bigint {
  return size <= 2 ? BigInt(size) : BigInt(size) - 2n;
}

/**
 * Solves the allocation. A base network that cannot fit everything still returns the
 * allocations that did fit, plus the first requirement that failed and by how much.
 */
export function solveVlsm(
  baseInput: string,
  requirements: readonly VlsmRequirement[],
  options: VlsmOptions = {},
): VlsmResult {
  const parsed = parseCidr(baseInput);
  if (!parsed.ok) return { ok: false, message: errorMessage(parsed.code) };
  if (parsed.value.family !== 4) {
    return { ok: false, message: 'The solver works on IPv4 — host-count sizing is an IPv4 problem.' };
  }

  const base = networkOf(parsed.value) as Cidr4;
  for (const requirement of requirements) {
    if (!Number.isInteger(requirement.requiredHosts) || requirement.requiredHosts < 1) {
      return {
        ok: false,
        message: `“${requirement.name}” needs a whole number of hosts, at least 1.`,
      };
    }
  }

  const sized = requirements.map((requirement, index) => ({
    requirement,
    index,
    size: blockSizeFor(requirement.requiredHosts, options.allowSlash31 === true),
  }));

  // Largest first; input order decides a tie, which is what makes the result reproducible.
  const order = [...sized].sort((a, b) => b.size - a.size || a.index - b.index);

  let free: Cidr4[] = [base];
  const allocations: VlsmAllocation[] = [];
  let failure: VlsmFailure | undefined;

  for (const entry of order) {
    const wantedPrefix = prefixForBlockSize(entry.size);
    if (wantedPrefix < base.prefix) {
      failure = {
        name: entry.requirement.name,
        shortfall: BigInt(entry.size) - totalAddresses(base),
      };
      break;
    }

    const candidates = free
      .filter((block) => block.prefix <= wantedPrefix)
      .sort(compareCidr);
    const chosen = candidates[0];

    if (chosen === undefined) {
      const largest = free.reduce(
        (best, block) => (totalAddresses(block) > best ? totalAddresses(block) : best),
        0n,
      );
      failure = { name: entry.requirement.name, shortfall: BigInt(entry.size) - largest };
      break;
    }

    // Split minimally: keep halving the lower half, returning each upper half to the free list.
    free = free.filter((block) => block !== chosen);
    let current: Cidr4 = chosen;
    while (current.prefix < wantedPrefix) {
      const halves = splitOnce(current);
      /* c8 ignore next -- current.prefix < wantedPrefix ≤ 32, so a split always exists. */
      if (!halves.ok) break;
      current = halves.value[0] as Cidr4;
      free.push(halves.value[1] as Cidr4);
    }

    allocations.push({
      name: entry.requirement.name,
      requiredHosts: entry.requirement.requiredHosts,
      block: current,
      summary: describeBlock(current),
      waste: usableIn(entry.size) - BigInt(entry.requirement.requiredHosts),
    });
  }

  allocations.sort((a, b) => compareCidr(a.block, b.block));
  const allocated = allocations.reduce((total, entry) => total + totalAddresses(entry.block), 0n);
  const total = totalAddresses(base);

  const solution: VlsmSolution = {
    base,
    allocations,
    free: mergeFree(free),
    totalAddresses: total,
    allocatedAddresses: allocated,
    utilisation: formatPercent(allocated, total),
    ...(failure === undefined ? {} : { failure }),
  };
  return { ok: true, solution };
}

/**
 * Sorts the leftovers and joins any two halves that are still whole, so the free list reads as
 * the largest blocks actually available rather than the fragments splitting happened to leave.
 */
function mergeFree(blocks: readonly Cidr4[]): Cidr4[] {
  let current = [...blocks].sort(compareCidr);
  let merged = true;

  while (merged) {
    merged = false;
    const next: Cidr4[] = [];
    for (let index = 0; index < current.length; index += 1) {
      const left = current[index] as Cidr4;
      const right = current[index + 1];
      if (
        right !== undefined &&
        left.prefix === right.prefix &&
        left.prefix > 0 &&
        isLowerHalf(left) &&
        siblingOf(left) === networkAddressOf(right)
      ) {
        next.push(makeCidr(4, networkAddressOf(left), left.prefix - 1));
        index += 1;
        merged = true;
      } else {
        next.push(left);
      }
    }
    current = next;
  }

  return current;
}

function isLowerHalf(block: Cidr4): boolean {
  const size = 2 ** (32 - block.prefix);
  return (networkAddressOf(block) / size) % 2 === 0;
}

function siblingOf(block: Cidr4): number {
  return (networkAddressOf(block) + 2 ** (32 - block.prefix)) >>> 0;
}

/** A convenience for the "Send to planner" action: the allocation as canonical block strings. */
export function allocationCidrs(solution: VlsmSolution): Array<{ cidr: string; name: string }> {
  return solution.allocations.map((entry) => ({
    cidr: formatCidr(entry.block as Cidr),
    name: entry.name,
  }));
}
