/**
 * Parse results for every domain module — IP addresses, and the numeric tools.
 *
 * Nothing in `src/lib` ever throws: every parser returns a discriminated union so a
 * malformed input can never take down a view (see DECISIONS.md D6). Successful parses can
 * still carry `warnings` — a stripped zone ID or an assumed host prefix is information,
 * not a failure (D7).
 */

/** Machine-readable reason a parse failed. The UI maps these to friendly copy. */
export type ParseErrorCode =
  | 'EMPTY'
  | 'BAD_FORM'
  | 'BAD_OCTET'
  | 'BAD_PREFIX'
  | 'BAD_GROUP'
  | 'DOUBLE_COMPRESSION'
  | 'TOO_MANY_GROUPS'
  | 'TOO_FEW_GROUPS'
  | 'NONCONTIGUOUS_MASK'
  | 'MASK_NOT_SUPPORTED'
  | 'AT_MAX_PREFIX'
  | 'FAMILY_MISMATCH'
  // The numeric tools (`src/lib/numeric`).
  | 'BAD_DIGITS'
  | 'MISSING_RADIX_PREFIX'
  | 'DOES_NOT_FIT'
  | 'NEGATIVE_RESULT'
  | 'WIDTH_MISMATCH';

/** Machine-readable note attached to a *successful* parse. */
export type WarningCode = 'ZONE_ID_STRIPPED' | 'ASSUMED_HOST_PREFIX' | 'HOST_BITS_SET';

export interface Warning {
  code: WarningCode;
  message: string;
}

export interface ParseError {
  readonly ok: false;
  readonly code: ParseErrorCode;
  /** Plain-English fallback message; views normally re-map `code` through `strings.ts`. */
  readonly message: string;
  /** The offending fragment, when one can be isolated. */
  readonly detail?: string;
}

export interface ParseOk<T> {
  readonly ok: true;
  readonly value: T;
  readonly warnings: Warning[];
}

export type ParseResult<T> = ParseOk<T> | ParseError;

export function fail(code: ParseErrorCode, message: string, detail?: string): ParseError {
  return detail === undefined
    ? { ok: false, code, message }
    : { ok: false, code, message, detail };
}

export function ok<T>(value: T, warnings: Warning[] = []): ParseOk<T> {
  return { ok: true, value, warnings };
}

export function warn(code: WarningCode, message: string): Warning {
  return { code, message };
}

/** Narrowing guard: `true` when a parse failed. */
export function isParseError<T>(result: ParseResult<T>): result is ParseError {
  return result.ok === false;
}
