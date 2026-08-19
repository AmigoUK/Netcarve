/**
 * Project persistence and the operations that act on a whole project rather than one tree
 * (FR-PLAN-01, FR-PLAN-02, FR-STOR-01).
 */

import { formatCidr, parseCidr } from '../ip/cidr';
import { errorMessage } from '../../strings';
import { networkOf, relationOf } from '../ip/math';
import { readRaw, STORAGE_KEYS, writeValue } from '../storage/store';
import {
  normaliseProject,
  type PlanNode,
  type Project,
  type QuarantinedRoot,
} from './model';

export interface LoadedProjects {
  readonly projects: Project[];
  /** Roots that failed validation, grouped by the project they came from. */
  readonly quarantined: ReadonlyArray<{ project: string; roots: QuarantinedRoot[] }>;
}

/** Reads every stored project, quarantining anything structurally broken. */
export async function loadProjects(): Promise<LoadedProjects> {
  const raw = await readRaw(STORAGE_KEYS.projects);
  if (!Array.isArray(raw)) return { projects: [], quarantined: [] };

  const projects: Project[] = [];
  const quarantined: Array<{ project: string; roots: QuarantinedRoot[] }> = [];

  for (const entry of raw) {
    const normalised = normaliseProject(entry);
    if (normalised === undefined) continue;
    projects.push(normalised.project);
    if (normalised.quarantined.length > 0) {
      quarantined.push({ project: normalised.project.name, roots: normalised.quarantined });
    }
  }

  return { projects, quarantined };
}

export async function saveProjects(projects: readonly Project[]): Promise<boolean> {
  return writeValue(STORAGE_KEYS.projects, projects);
}

export function findProject(projects: readonly Project[], id: string): Project | undefined {
  return projects.find((project) => project.id === id);
}

/** Stamps `updatedAt`. Every mutation goes through this so the project list stays honest. */
export function touch(project: Project, now = Date.now()): Project {
  return { ...project, updatedAt: now };
}

/** Inserts or replaces a project, keeping the most recently updated first. */
export function upsertProject(projects: readonly Project[], project: Project): Project[] {
  const without = projects.filter((entry) => entry.id !== project.id);
  return [project, ...without].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function removeProject(projects: readonly Project[], id: string): Project[] {
  return projects.filter((project) => project.id !== id);
}

export type AddRootResult =
  | { readonly ok: true; readonly project: Project }
  | { readonly ok: false; readonly message: string };

/**
 * Adds a root block, refusing anything that overlaps a root already in the project
 * (FR-PLAN-02). Overlap is decided with `relationOf`, so an identical block and a
 * containing block are both caught.
 */
export function addRoot(project: Project, input: string, now = Date.now()): AddRootResult {
  const parsed = parseCidr(input);
  if (!parsed.ok) return { ok: false, message: errorMessage(parsed.code) };

  const block = networkOf(parsed.value);
  const canonical = formatCidr(block);

  for (const root of project.roots) {
    const existing = parseCidr(root.cidr);
    /* c8 ignore next -- stored roots are validated on load. */
    if (!existing.ok) continue;
    if (relationOf(block, existing.value) !== 'disjoint') {
      return { ok: false, message: root.cidr };
    }
  }

  const node: PlanNode = { cidr: canonical };
  return {
    ok: true,
    project: touch({ ...project, roots: [...project.roots, node] }, now),
  };
}

/** Replaces one root tree by index. */
export function replaceRoot(
  project: Project,
  index: number,
  root: PlanNode,
  now = Date.now(),
): Project {
  const roots = project.roots.map((existing, position) => (position === index ? root : existing));
  return touch({ ...project, roots }, now);
}

export function removeRoot(project: Project, index: number, now = Date.now()): Project {
  return touch(
    { ...project, roots: project.roots.filter((_root, position) => position !== index) },
    now,
  );
}
