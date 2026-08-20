/**
 * The converter's rows, and the two renderings of them.
 *
 * The view and the exporters read the same list, so a copied table can never disagree with what
 * was on screen.
 */

import { strings } from '../../strings';
import {
  toAddressForm,
  toBinary,
  toDecimal,
  toHex,
  type NumericValue,
} from '../numeric/value';
import { popCount } from '../numeric/bitwise';
import { markdownTable, withFooter as withMarkdownFooter } from './markdown';
import { plainTable, withFooter as withPlainFooter } from './plain';

export interface ConverterRow {
  readonly label: string;
  readonly value: string;
}

/** Every base the converter shows, in the order it shows them. */
export function converterRows(value: NumericValue): ConverterRow[] {
  const rows: ConverterRow[] = [
    { label: strings.tools.rows.decimal, value: toDecimal(value) },
    { label: strings.tools.rows.hex, value: toHex(value) },
    { label: strings.tools.rows.binary, value: toBinary(value) },
  ];

  const address = toAddressForm(value);
  if (address !== undefined) {
    rows.push({
      label: value.width === 32 ? strings.tools.rows.ipv4 : strings.tools.rows.ipv6,
      value: address,
    });
  }
  return rows;
}

function heading(value: NumericValue): string {
  return `${strings.tools.converterTitle} — ${strings.tools.widthOption(value.width)}, ${strings.tools.setBits(
    popCount(value),
    value.width,
  )}`;
}

export function converterToMarkdown(value: NumericValue, includeFooter = true): string {
  const body = [
    `## ${heading(value)}`,
    '',
    markdownTable(
      ['Base', 'Value'],
      converterRows(value).map((row) => [row.label, row.value]),
    ),
  ].join('\n');
  return withMarkdownFooter(body, includeFooter);
}

export function converterToPlain(value: NumericValue, includeFooter = true): string {
  const body = [
    heading(value),
    '',
    plainTable(
      ['Base', 'Value'],
      converterRows(value).map((row) => [row.label, row.value]),
    ),
  ].join('\n');
  return withPlainFooter(body, includeFooter);
}
