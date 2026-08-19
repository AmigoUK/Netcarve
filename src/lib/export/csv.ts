/**
 * CSV export (FR-EXP-02): RFC 4180 quoting, UTF-8, CRLF line endings.
 */

import type { Project } from '../plan/model';
import type { VlsmSolution } from '../vlsm/solver';
import { projectSections, PROJECT_COLUMNS } from './project';

/** Quotes a field only when RFC 4180 requires it, doubling any embedded quote. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
  return [headers, ...rows]
    .map((row) => row.map(csvField).join(','))
    .join('\r\n')
    .concat('\r\n');
}

/**
 * Every leaf of every root, as one sheet. A leading `Root` column keeps the rows meaningful
 * when a project holds more than one root block.
 */
export function projectToCsv(project: Project): string {
  const sections = projectSections(project, true);
  const multiRoot = sections.length > 1;
  const headers = multiRoot ? ['Root', ...PROJECT_COLUMNS] : [...PROJECT_COLUMNS];
  const rows = sections.flatMap((section) =>
    section.rows.map((row) => (multiRoot ? [section.rootCidr, ...row.cells] : row.cells)),
  );
  return toCsv(headers, rows);
}

/** A solved VLSM allocation as CSV (FR-VLSM-07). */
export function vlsmToCsv(solution: VlsmSolution): string {
  return toCsv(
    ['Name', 'Allocated block', 'Mask', 'Range', 'Usable', 'Waste'],
    solution.allocations.map((entry) => [
      entry.name,
      entry.summary.cidr,
      entry.summary.mask,
      entry.summary.range,
      entry.summary.usableCount.toString(),
      entry.waste.toString(),
    ]),
  );
}
