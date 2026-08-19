/**
 * Plain-text export.
 *
 * Settings offers a default copy format of Markdown or plain text; this is the plain half.
 * It carries exactly the same content as `markdown.ts` — the same fields, the same columns,
 * the same footer rule — with the syntax swapped for space-aligned columns, so a result can
 * go into a ticket, a terminal or an email that renders nothing.
 */

import { strings } from '../../strings';
import type { CalcResult } from '../calc/result';
import type { Project } from '../plan/model';
import { projectSections, PROJECT_COLUMNS } from './project';
import { formatCidr } from '../ip/cidr';
import { groupDigits } from '../format';
import type { VlsmSolution } from '../vlsm/solver';
import type { ConflictReport } from '../conflict/checker';

/** Pads every column to the widest cell in it, so the table lines up in a monospace font. */
export function plainTable(headers: readonly string[], rows: readonly string[][]): string {
  const widths = headers.map((header, column) =>
    rows.reduce((widest, row) => Math.max(widest, (row[column] ?? '').length), header.length),
  );
  const line = (cells: readonly string[]) =>
    cells
      .map((cell, column) => (cell ?? '').padEnd(widths[column] ?? 0))
      .join('  ')
      .trimEnd();

  return [line(headers), widths.map((width) => '-'.repeat(width)).join('  '), ...rows.map(line)].join(
    '\n',
  );
}

export function withFooter(body: string, includeFooter: boolean): string {
  return includeFooter ? `${body}\n\n${strings.exports.footer}\n` : `${body}\n`;
}

/** A single calculator result as an aligned label/value list. */
export function calcToPlain(result: CalcResult, includeFooter = true): string {
  const sections = [
    result.input,
    '',
    plainTable(['Field', 'Value'], result.fields.map((field) => [field.label, field.value])),
  ];

  if (result.specials.length > 0) {
    sections.push(
      '',
      `${strings.calc.specialTitle}:`,
      ...result.specials.map((match) => {
        const suffix = match.range.deprecated === true ? ` (${strings.calc.deprecated})` : '';
        return `  ${match.range.cidr} — ${match.range.label}${suffix}`;
      }),
    );
  }

  if (result.notes.length > 0) {
    sections.push('', ...result.notes.map((note) => `  ${note.text}`));
  }

  return withFooter(sections.join('\n'), includeFooter);
}

/** A whole project as plain text: one aligned table per root block. */
export function projectToPlain(project: Project, includeFooter = true): string {
  const lines: string[] = [project.name];
  if (project.client !== undefined) lines.push(`Client: ${project.client}`);
  if (project.notes !== undefined) lines.push('', project.notes);

  const sections = projectSections(project);
  if (sections.length === 0) lines.push('', 'No blocks planned yet.');

  for (const section of sections) {
    lines.push(
      '',
      section.rootCidr,
      '',
      plainTable(PROJECT_COLUMNS, section.rows.map((row) => row.cells)),
    );
  }

  return withFooter(lines.join('\n'), includeFooter);
}

const VLSM_COLUMNS = ['Name', 'Allocated block', 'Mask', 'Range', 'Usable', 'Waste'] as const;

/** A solved VLSM allocation as plain text. */
export function vlsmToPlain(solution: VlsmSolution, includeFooter = true): string {
  const lines: string[] = [
    `${strings.vlsm.title} — ${formatCidr(solution.base)}`,
    '',
    plainTable(
      VLSM_COLUMNS,
      solution.allocations.map((entry) => [
        entry.name,
        entry.summary.cidr,
        entry.summary.mask,
        entry.summary.range,
        entry.summary.usable.primary,
        entry.waste.toString(),
      ]),
    ),
    '',
    strings.vlsm.summary(
      groupDigits(solution.allocatedAddresses),
      groupDigits(solution.totalAddresses),
      solution.utilisation,
    ),
  ];

  if (solution.failure !== undefined) {
    lines.push(
      '',
      strings.vlsm.shortfall(solution.failure.name, groupDigits(solution.failure.shortfall)),
    );
  }

  lines.push(
    '',
    `${strings.vlsm.freeBlocks}:`,
    solution.free.length === 0
      ? `  ${strings.vlsm.noFreeBlocks}`
      : solution.free.map((block) => `  ${formatCidr(block)}`).join('\n'),
  );

  return withFooter(lines.join('\n'), includeFooter);
}

/** A conflict report as plain text. */
export function conflictsToPlain(report: ConflictReport, includeFooter = true): string {
  const lines: string[] = [strings.conflicts.title, ''];

  if (report.clean) {
    lines.push(strings.conflicts.clean(report.blockCount));
  } else {
    if (report.identical.length > 0) {
      lines.push(`${strings.conflicts.identical}:`);
      for (const group of report.identical) {
        lines.push(`  ${group.cidr} — lines ${group.lines.join(', ')}`);
      }
      lines.push('');
    }
    if (report.containment.length > 0) {
      lines.push(`${strings.conflicts.containment}:`);
      for (const chain of report.containment) {
        lines.push(`  ${chain.blocks.map((block) => block.cidr).join(' ⊃ ')}`);
      }
      lines.push('');
    }
    lines.push(strings.conflicts.alignmentNote);
  }

  if (report.errors.length > 0) {
    lines.push('', `${strings.conflicts.invalidLines(report.errors.length)}`);
    for (const error of report.errors) {
      lines.push(`  ${strings.conflicts.lineError(error.line, error.text, error.message)}`);
    }
  }

  return withFooter(lines.join('\n'), includeFooter);
}
