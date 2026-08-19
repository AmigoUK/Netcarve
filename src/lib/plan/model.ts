/**
 * The planner's data model (spec §9.5) and the validation that guards it.
 *
 * Derived values — mask, range, usable counts — are never stored; only the block string and
 * the metadata a human typed. The structural invariant is that a node's children are exactly
 * `splitOnce(node.cidr)`, and a root that breaks it is quarantined on load rather than
 * allowed to crash the app.
 */

import { formatCidr, parseCidr, type Cidr } from '../ip/cidr';
import { networkOf, splitOnce } from '../ip/math';
import { MAX_VLAN_ID, MIN_VLAN_ID } from './limits';

export type PaletteToken =
  | 'blue'
  | 'green'
  | 'amber'
  | 'red'
  | 'violet'
  | 'teal'
  | 'pink'
  | 'grey';

/** The eight palette tokens, in the order the swatch picker shows them. */
export const PALETTE: readonly PaletteToken[] = [
  'blue',
  'green',
  'amber',
  'red',
  'violet',
  'teal',
  'pink',
  'grey',
];

export interface PlanNode {
  /** Canonical network form, e.g. `10.20.0.0/16` or `2001:db8::/48`. */
  cidr: string;
  name?: string;
  /** Leaves only. */
  colour?: PaletteToken;
  /** Leaves only; 1–4094. */
  vlanId?: number;
  /** Leaves only. */
  notes?: string;
  /** Present ⇒ internal node. Always exactly `splitOnce(cidr)`. */
  children?: [PlanNode, PlanNode];
}

export interface Project {
  id: string;
  schemaVersion: 1;
  name: string;
  client?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  roots: PlanNode[];
}

export const PROJECT_SCHEMA_VERSION = 1;

/** A root that failed validation, kept out of the tree but reported to the user. */
export interface QuarantinedRoot {
  readonly cidr: string;
  readonly reason: string;
}

export interface NormalisedProject {
  readonly project: Project;
  readonly quarantined: QuarantinedRoot[];
}

function newId(): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  /* c8 ignore next -- only reached on a platform without crypto.randomUUID. */
  return `nc-${Math.abs(Date.now()) .toString(36)}-${(globalThis.performance?.now?.() ?? 0).toString(36)}`;
}

export function createProject(
  name: string,
  extra: { client?: string; notes?: string; roots?: PlanNode[]; now?: number } = {},
): Project {
  const now = extra.now ?? Date.now();
  const project: Project = {
    id: newId(),
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: name.trim() === '' ? 'Untitled plan' : name.trim(),
    createdAt: now,
    updatedAt: now,
    roots: extra.roots ?? [],
  };
  if (extra.client !== undefined && extra.client !== '') project.client = extra.client;
  if (extra.notes !== undefined && extra.notes !== '') project.notes = extra.notes;
  return project;
}

/** Builds a leaf from a block, always storing the canonical network form. */
export function nodeFromCidr(cidr: Cidr, metadata: Omit<PlanNode, 'cidr' | 'children'> = {}): PlanNode {
  return { cidr: formatCidr(networkOf(cidr)), ...metadata };
}

/** Parses a node's `cidr`, or `undefined` when it is not a canonical network block. */
export function blockOf(node: PlanNode): Cidr | undefined {
  const parsed = parseCidr(node.cidr);
  if (!parsed.ok) return undefined;
  return formatCidr(networkOf(parsed.value)) === node.cidr ? parsed.value : undefined;
}

function cleanText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function cleanVlan(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_VLAN_ID &&
    value <= MAX_VLAN_ID
    ? value
    : undefined;
}

function cleanColour(value: unknown): PaletteToken | undefined {
  return typeof value === 'string' && (PALETTE as readonly string[]).includes(value)
    ? (value as PaletteToken)
    : undefined;
}

/**
 * Validates and repairs one node. Metadata that no longer makes sense is dropped; structural
 * damage — an unparsable block, or children that are not the block's two halves — throws the
 * reason, which `normaliseProject` catches to quarantine the whole root.
 */
function validateNode(raw: unknown): PlanNode {
  if (typeof raw !== 'object' || raw === null) throw new Error('a node was not an object');
  const value = raw as Record<string, unknown>;

  if (typeof value.cidr !== 'string') throw new Error('a node had no block');
  const parsed = parseCidr(value.cidr);
  if (!parsed.ok) throw new Error(`“${value.cidr}” is not a valid block`);
  const canonical = formatCidr(networkOf(parsed.value));
  if (canonical !== value.cidr) {
    throw new Error(`“${value.cidr}” is not written as a network address`);
  }

  const node: PlanNode = { cidr: canonical };
  const name = cleanText(value.name);
  if (name !== undefined) node.name = name;

  if (value.children === undefined) {
    const colour = cleanColour(value.colour);
    if (colour !== undefined) node.colour = colour;
    const vlanId = cleanVlan(value.vlanId);
    if (vlanId !== undefined) node.vlanId = vlanId;
    const notes = cleanText(value.notes);
    if (notes !== undefined) node.notes = notes;
    return node;
  }

  if (!Array.isArray(value.children) || value.children.length !== 2) {
    throw new Error(`“${canonical}” has a malformed pair of children`);
  }
  const halves = splitOnce(parsed.value);
  if (!halves.ok) throw new Error(`“${canonical}” cannot have children`);

  const children = value.children.map((child) => validateNode(child)) as [PlanNode, PlanNode];
  const expected = halves.value.map(formatCidr);
  if (children[0].cidr !== expected[0] || children[1].cidr !== expected[1]) {
    throw new Error(`“${canonical}” has children that are not its two halves`);
  }

  node.children = children;
  return node;
}

/** Validates a single root, returning either the repaired node or the reason it failed. */
export function validateRoot(raw: unknown): { ok: true; node: PlanNode } | { ok: false; reason: string } {
  try {
    return { ok: true, node: validateNode(raw) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'unreadable' };
  }
}

/**
 * Coerces stored data into a valid project. Roots that fail validation are quarantined and
 * reported; everything else loads as normal.
 */
export function normaliseProject(raw: unknown): NormalisedProject | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return undefined;

  const roots: PlanNode[] = [];
  const quarantined: QuarantinedRoot[] = [];
  const rawRoots = Array.isArray(value.roots) ? value.roots : [];

  for (const rawRoot of rawRoots) {
    const result = validateRoot(rawRoot);
    if (result.ok) {
      roots.push(result.node);
    } else {
      const label =
        typeof rawRoot === 'object' && rawRoot !== null && typeof (rawRoot as PlanNode).cidr === 'string'
          ? (rawRoot as PlanNode).cidr
          : 'unknown block';
      quarantined.push({ cidr: label, reason: result.reason });
    }
  }

  const now = Date.now();
  const project: Project = {
    id: value.id,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: value.name,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : now,
    roots,
  };
  const client = cleanText(value.client);
  if (client !== undefined) project.client = client;
  const notes = cleanText(value.notes);
  if (notes !== undefined) project.notes = notes;

  return { project, quarantined };
}
