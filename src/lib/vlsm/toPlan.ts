/**
 * Turns a solved allocation into a planner tree (FR-VLSM-06).
 *
 * The tree is rebuilt from the base block by splitting only where an allocation actually sits,
 * so the result is exactly the structure the solver produced — and it satisfies the planner's
 * invariant that a node's children are its two halves.
 */

import { formatCidr, parseCidr, type Cidr } from '../ip/cidr';
import { contains, splitOnce } from '../ip/math';
import type { PlanNode } from '../plan/model';
import type { VlsmSolution } from './solver';

interface Allocation {
  readonly block: Cidr;
  readonly name: string;
}

function build(block: Cidr, allocations: readonly Allocation[]): PlanNode {
  const cidr = formatCidr(block);
  const exact = allocations.find((allocation) => formatCidr(allocation.block) === cidr);
  if (exact !== undefined) {
    return exact.name.trim() === '' ? { cidr } : { cidr, name: exact.name };
  }

  const inside = allocations.filter((allocation) => contains(block, allocation.block));
  if (inside.length === 0) return { cidr };

  const halves = splitOnce(block);
  /* c8 ignore next -- an allocation inside `block` means `block` is not a single address. */
  if (!halves.ok) return { cidr };

  return {
    cidr,
    children: [build(halves.value[0], inside), build(halves.value[1], inside)],
  };
}

/** The solution as a single root block ready to drop into a project. */
export function solutionToRoot(solution: VlsmSolution): PlanNode {
  const allocations: Allocation[] = solution.allocations.map((entry) => ({
    block: entry.block,
    name: entry.name,
  }));
  return build(solution.base, allocations);
}

/** Convenience for tests and callers holding only strings. */
export function blockFromString(cidr: string): Cidr | undefined {
  const parsed = parseCidr(cidr);
  return parsed.ok ? parsed.value : undefined;
}
