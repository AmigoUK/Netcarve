/**
 * Tree operations for the planner (F3).
 *
 * Every function is pure: it returns a new tree rather than mutating the one it was given,
 * which is what makes undo/redo a matter of keeping old roots around.
 *
 * A node is addressed by its **path** — the sequence of child indices from the root, so `[]`
 * is the root itself and `[0, 1]` is the second half of the first half.
 */

import { formatCidr, type Cidr } from '../ip/cidr';
import { splitOnce, totalAddresses } from '../ip/math';
import { MAX_LEAVES_PER_ROOT } from './limits';
import { blockOf, type PlanNode } from './model';

export type PlanPath = readonly number[];

export type PlanErrorCode =
  | 'NOT_FOUND'
  | 'NOT_A_LEAF'
  | 'NOT_A_BRANCH'
  | 'AT_MAX_PREFIX'
  | 'LEAF_LIMIT'
  | 'BAD_TARGET_PREFIX'
  | 'BAD_BLOCK';

export type PlanResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: PlanErrorCode; readonly detail?: string };

const fail = (code: PlanErrorCode, detail?: string): PlanResult<never> =>
  detail === undefined ? { ok: false, code } : { ok: false, code, detail };

const succeed = <T>(value: T): PlanResult<T> => ({ ok: true, value });

export function isLeaf(node: PlanNode): boolean {
  return node.children === undefined;
}

/** The node at `path`, or `undefined` when the path does not exist. */
export function nodeAt(root: PlanNode, path: PlanPath): PlanNode | undefined {
  let current: PlanNode | undefined = root;
  for (const index of path) {
    if (current?.children === undefined) return undefined;
    current = current.children[index === 0 ? 0 : 1];
  }
  return current;
}

/** Every leaf under `node`, in address order. */
export function leavesOf(node: PlanNode): PlanNode[] {
  if (node.children === undefined) return [node];
  return [...leavesOf(node.children[0]), ...leavesOf(node.children[1])];
}

export function countLeaves(node: PlanNode): number {
  if (node.children === undefined) return 1;
  return countLeaves(node.children[0]) + countLeaves(node.children[1]);
}

/** How many leaves under `node` carry a name — what a join would destroy. */
export function countNamedLeaves(node: PlanNode): number {
  return leavesOf(node).filter((leaf) => leaf.name !== undefined && leaf.name.trim() !== '')
    .length;
}

export interface PlanRow {
  readonly node: PlanNode;
  readonly path: PlanPath;
  readonly depth: number;
  readonly block: Cidr;
  readonly leaf: boolean;
}

/**
 * Flattens the tree into rows in address order, ready for an indented list. `collapsed`
 * holds the paths (as `pathKey` strings) whose children should not be walked.
 */
export function flattenTree(
  root: PlanNode,
  collapsed: ReadonlySet<string> = new Set(),
  path: PlanPath = [],
  depth = 0,
  into: PlanRow[] = [],
): PlanRow[] {
  const block = blockOf(root);
  /* c8 ignore next -- validated trees always parse; this keeps a corrupt node from throwing. */
  if (block === undefined) return into;

  const leaf = isLeaf(root);
  into.push({ node: root, path, depth, block, leaf });

  if (!leaf && !collapsed.has(pathKey(path))) {
    const children = root.children as [PlanNode, PlanNode];
    flattenTree(children[0], collapsed, [...path, 0], depth + 1, into);
    flattenTree(children[1], collapsed, [...path, 1], depth + 1, into);
  }
  return into;
}

/** A stable string form of a path, for use as a key or a Set member. */
export function pathKey(path: PlanPath): string {
  return path.join('.');
}

/** Replaces the node at `path` using `transform`, returning a new root. */
function replaceAt(
  root: PlanNode,
  path: PlanPath,
  transform: (node: PlanNode) => PlanResult<PlanNode>,
): PlanResult<PlanNode> {
  if (path.length === 0) return transform(root);
  if (root.children === undefined) return fail('NOT_FOUND', formatPath(path));

  const index = path[0] === 0 ? 0 : 1;
  const replaced = replaceAt(root.children[index], path.slice(1), transform);
  if (!replaced.ok) return replaced;

  const children: [PlanNode, PlanNode] =
    index === 0 ? [replaced.value, root.children[1]] : [root.children[0], replaced.value];
  return succeed({ ...root, children });
}

function formatPath(path: PlanPath): string {
  return `/${path.join('/')}`;
}

/** Splits one leaf into its two halves (FR-PLAN-03). */
export function splitNode(root: PlanNode, path: PlanPath): PlanResult<PlanNode> {
  const target = nodeAt(root, path);
  if (target === undefined) return fail('NOT_FOUND', formatPath(path));
  if (!isLeaf(target)) return fail('NOT_A_LEAF', target.cidr);
  if (countLeaves(root) + 1 > MAX_LEAVES_PER_ROOT) {
    return fail('LEAF_LIMIT', String(countLeaves(root) + 1));
  }

  return replaceAt(root, path, (node) => {
    const block = blockOf(node);
    if (block === undefined) return fail('BAD_BLOCK', node.cidr);
    const halves = splitOnce(block);
    if (!halves.ok) return fail('AT_MAX_PREFIX', node.cidr);

    // Splitting keeps the node's own name; leaf-only metadata belongs to leaves, so it is
    // dropped rather than silently duplicated into both halves.
    const parent: PlanNode = { cidr: node.cidr };
    if (node.name !== undefined) parent.name = node.name;
    parent.children = [
      { cidr: formatCidr(halves.value[0]) },
      { cidr: formatCidr(halves.value[1]) },
    ];
    return succeed(parent);
  });
}

/** Collapses a node's whole subtree back into a single leaf (FR-PLAN-03). */
export function joinNode(root: PlanNode, path: PlanPath): PlanResult<PlanNode> {
  const target = nodeAt(root, path);
  if (target === undefined) return fail('NOT_FOUND', formatPath(path));
  if (isLeaf(target)) return fail('NOT_A_BRANCH', target.cidr);

  return replaceAt(root, path, (node) => {
    const joined: PlanNode = { cidr: node.cidr };
    if (node.name !== undefined) joined.name = node.name;
    return succeed(joined);
  });
}

/**
 * Carves a node into equal blocks at `targetPrefix` (FR-PLAN-04).
 *
 * The whole operation is refused — rather than partly applied — when it would push the root
 * past {@link MAX_LEAVES_PER_ROOT}.
 */
export function splitToPrefix(
  root: PlanNode,
  path: PlanPath,
  targetPrefix: number,
): PlanResult<PlanNode> {
  const target = nodeAt(root, path);
  if (target === undefined) return fail('NOT_FOUND', formatPath(path));
  const block = blockOf(target);
  if (block === undefined) return fail('BAD_BLOCK', target.cidr);

  const maxPrefix = block.family === 4 ? 32 : 128;
  if (
    !Number.isInteger(targetPrefix) ||
    targetPrefix <= block.prefix ||
    targetPrefix > maxPrefix
  ) {
    return fail('BAD_TARGET_PREFIX', String(targetPrefix));
  }

  const depth = targetPrefix - block.prefix;
  // 2^depth is safe here: `depth` is capped by the leaf-limit check immediately below.
  const newLeaves = depth >= 31 ? Number.POSITIVE_INFINITY : 2 ** depth;
  const resulting = countLeaves(root) - countLeaves(target) + newLeaves;
  if (resulting > MAX_LEAVES_PER_ROOT) {
    return fail('LEAF_LIMIT', String(resulting));
  }

  return replaceAt(root, path, (node) => succeed(carve(node, depth)));
}

/** Recursively splits `node` `depth` times, discarding leaf-only metadata as it goes. */
function carve(node: PlanNode, depth: number): PlanNode {
  if (depth === 0) return node;

  const block = blockOf(node);
  /* c8 ignore next -- guarded by splitToPrefix. */
  if (block === undefined) return node;
  const halves = splitOnce(block);
  /* c8 ignore next -- guarded by splitToPrefix. */
  if (!halves.ok) return node;

  const parent: PlanNode = { cidr: node.cidr };
  if (node.name !== undefined) parent.name = node.name;
  parent.children = [
    carve({ cidr: formatCidr(halves.value[0]) }, depth - 1),
    carve({ cidr: formatCidr(halves.value[1]) }, depth - 1),
  ];
  return parent;
}

/** Applies a metadata patch to one node (FR-PLAN-05). */
export function updateNode(
  root: PlanNode,
  path: PlanPath,
  patch: Partial<Omit<PlanNode, 'cidr' | 'children'>>,
): PlanResult<PlanNode> {
  return replaceAt(root, path, (node) => {
    const next: PlanNode = { ...node, ...patch };
    // An empty string means "cleared", which the model expresses as an absent key.
    for (const key of ['name', 'notes'] as const) {
      const value = next[key];
      if (value === undefined || value.trim() === '') delete next[key];
    }
    if (next.vlanId === undefined) delete next.vlanId;
    if (next.colour === undefined) delete next.colour;
    return succeed(next);
  });
}

export interface Utilisation {
  /** Addresses covered by named leaves. */
  readonly named: bigint;
  /** Addresses in the root. */
  readonly total: bigint;
  /** Addresses in unnamed leaves. */
  readonly free: bigint;
}

/** How much of a root block is actually planned (FR-PLAN-07). */
export function utilisation(root: PlanNode): Utilisation {
  const block = blockOf(root);
  /* c8 ignore next -- validated roots always parse. */
  if (block === undefined) return { named: 0n, total: 0n, free: 0n };

  const total = totalAddresses(block);
  let named = 0n;
  for (const leaf of leavesOf(root)) {
    if (leaf.name === undefined || leaf.name.trim() === '') continue;
    const leafBlock = blockOf(leaf);
    /* c8 ignore next -- validated leaves always parse. */
    if (leafBlock === undefined) continue;
    named += totalAddresses(leafBlock);
  }
  return { named, total, free: total - named };
}
