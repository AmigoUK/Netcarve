/**
 * The shared row shape behind every project export (FR-EXP-01/02).
 *
 * The columns are fixed by the specification: `Subnet | Mask | Range | Usable | Name | VLAN |
 * Notes`, with the Mask column left blank for IPv6 rows.
 */

import { parseCidr } from '../ip/cidr';
import { describeBlock } from '../plan/describe';
import type { PlanNode, Project } from '../plan/model';
import { leavesOf } from '../plan/tree';

export const PROJECT_COLUMNS = [
  'Subnet',
  'Mask',
  'Range',
  'Usable',
  'Name',
  'VLAN',
  'Notes',
] as const;

export interface ProjectExportRow {
  readonly cells: string[];
}

export interface ProjectExportSection {
  readonly rootCidr: string;
  readonly rows: ProjectExportRow[];
}

function rowFor(leaf: PlanNode, exact: boolean): ProjectExportRow {
  const parsed = parseCidr(leaf.cidr);
  /* c8 ignore next -- every stored leaf has been validated. */
  if (!parsed.ok) return { cells: [leaf.cidr, '', '', '', leaf.name ?? '', '', leaf.notes ?? ''] };

  const summary = describeBlock(parsed.value);
  return {
    cells: [
      summary.cidr,
      summary.mask,
      summary.range,
      exact ? summary.usableCount.toString() : summary.usable.primary,
      leaf.name ?? '',
      leaf.vlanId === undefined ? '' : String(leaf.vlanId),
      leaf.notes ?? '',
    ],
  };
}

/**
 * One section per root block, each holding its leaves in address order.
 * `exact` swaps the display-friendly usable count for plain digits, which is what CSV wants.
 */
export function projectSections(project: Project, exact = false): ProjectExportSection[] {
  return project.roots.map((root) => ({
    rootCidr: root.cidr,
    rows: leavesOf(root).map((leaf) => rowFor(leaf, exact)),
  }));
}
