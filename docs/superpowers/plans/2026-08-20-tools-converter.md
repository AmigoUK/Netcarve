# Tools Page Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Each task ends with
> a green test run, a commit and a push. The release is cut once at the end of Task 7.

**Goal:** Add a `#/tools` page to the full-page app holding a base converter, bitwise operations
and mask/prefix conversion, over a new width-aware numeric core.

**Architecture:** A new `src/lib/numeric/` module owns "a number of known width" — parsing,
formatting, bitwise operations and masks — and is pure, framework-free TypeScript like the rest of
`src/lib`. The view is a thin Preact layer over it, reusing `Copyable`, `ExportBar` and the panel
styles, plus one new `BitField` component whose bits are buttons.

**Tech Stack:** TypeScript (strict, no `any` in `src/lib`) · Preact + hooks · Vitest ·
`@testing-library/preact` · Playwright (headless) · plain CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-08-20-tools-converter-design.md`

## Global Constraints

- Manifest permissions stay exactly `["storage", "contextMenus"]` — nothing new (NFR-PERM-01).
- No network requests, no remote assets (NFR-PERM-02, NFR-PRIV-01).
- No `any` in `src/lib/**`; `tsc --noEmit` clean under `strict`.
- `src/lib/ip/**` **and now `src/lib/numeric/**`** hold 100 % branch coverage (NFR-QUAL-01,
  FR-TOOL-08).
- All user-facing copy in British English, in `src/strings.ts` (NFR-I18N-01).
- Addresses and numbers render in the `ui-monospace` stack.
- Bundle stays under 150 KB gzipped (NFR-SIZE-01); currently ~44 KB.
- Widths are exactly `8 | 16 | 32 | 48 | 64 | 128`.
- Arithmetic refuses to leave the width; bitwise truncates to it (FR-TOOL-02).

---

## File Structure

```
src/lib/errors.ts                 MOVED from src/lib/ip/errors.ts, plus five new codes
src/lib/numeric/value.ts          BitWidth, NumericValue, parseNumeric, withWidth, formatters
src/lib/numeric/bitwise.ts        applyBitwise, not, shifts, popCount, toggleBit
src/lib/numeric/mask.ts           prefixToMask, maskToPrefix
src/lib/numeric/index.ts          barrel
src/ui/components/BitField.tsx    clickable bit display
src/ui/views/Tools.tsx            the #/tools page: converter, bitwise, masks
src/ui/router.ts                  MODIFY: 'tools' route name
entrypoints/app/App.tsx           MODIFY: nav entry + route branch
entrypoints/app/style.css         MODIFY: bit-field and tools styles
src/strings.ts                    MODIFY: `tools` copy + new error messages
src/lib/export/markdown.ts        MODIFY: converterToMarkdown
src/lib/export/plain.ts           MODIFY: converterToPlain
src/ui/views/Calculator.tsx       MODIFY: "Open in converter" link
vitest.config.ts                  MODIFY: coverage threshold for src/lib/numeric

tests/lib/numeric/value.test.ts
tests/lib/numeric/bitwise.test.ts
tests/lib/numeric/mask.test.ts
tests/ui/tools.test.tsx
tests/e2e/tools.spec.ts
tests/e2e/a11y.spec.ts            MODIFY: add the /tools route
```

---

## Task 1 — Move the error vocabulary out of `ip/`

**Files:**
- Create: `src/lib/errors.ts` (moved content)
- Delete: `src/lib/ip/errors.ts`
- Modify: every importer (`src/lib/ip/*.ts`, `src/lib/plan/projects.ts`, `src/lib/conflict/checker.ts`, `src/lib/vlsm/solver.ts`, `src/strings.ts`, tests)

**Interfaces:**
- Produces: `ParseResult<T>`, `ParseError`, `ParseOk<T>`, `fail`, `ok`, `warn`, `isParseError`,
  `ParseErrorCode` now including `BAD_DIGITS | MISSING_RADIX_PREFIX | DOES_NOT_FIT |
  NEGATIVE_RESULT | WIDTH_MISMATCH`.

- [ ] **Step 1: Move the file and update imports**

```bash
git mv src/lib/ip/errors.ts src/lib/errors.ts
grep -rl "ip/errors\|'./errors'" src tests | xargs sed -i \
  -e "s#from '\.\./\.\./src/lib/ip/errors'#from '../../src/lib/errors'#g"
# then fix the remaining relative paths by hand — tsc names every one
```

- [ ] **Step 2: Add the five new codes**

```ts
export type ParseErrorCode =
  | 'EMPTY' | 'BAD_FORM' | 'BAD_OCTET' | 'BAD_PREFIX' | 'BAD_GROUP'
  | 'DOUBLE_COMPRESSION' | 'TOO_MANY_GROUPS' | 'TOO_FEW_GROUPS'
  | 'NONCONTIGUOUS_MASK' | 'MASK_NOT_SUPPORTED' | 'AT_MAX_PREFIX' | 'FAMILY_MISMATCH'
  | 'BAD_DIGITS' | 'MISSING_RADIX_PREFIX' | 'DOES_NOT_FIT' | 'NEGATIVE_RESULT'
  | 'WIDTH_MISMATCH';
```

- [ ] **Step 3: Add the copy in `src/strings.ts`**

```ts
BAD_DIGITS: 'That is not a number NetCarve can read.',
MISSING_RADIX_PREFIX: 'Prefix hexadecimal with 0x and binary with 0b — 123 is both decimal and hex.',
DOES_NOT_FIT: 'That value does not fit in the chosen width.',
NEGATIVE_RESULT: 'The result is below zero.',
WIDTH_MISMATCH: 'Both values must have the same width.',
```

- [ ] **Step 4: Verify nothing else moved**

Run: `npm run typecheck && npx vitest run`
Expected: clean, 586 tests still passing — this task changes no behaviour.

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "refactor: move the shared parse-error vocabulary to src/lib/errors.ts"
git push origin main
```

---

## Task 2 — `numeric/value.ts`: widths, parsing, formatting

**Files:**
- Create: `src/lib/numeric/value.ts`, `src/lib/numeric/index.ts`
- Test: `tests/lib/numeric/value.test.ts`

**Interfaces:**
- Consumes: `ParseResult`, `fail`, `ok` from `../errors`; `parseIPv4`, `formatIPv4` from
  `../ip/v4`; `parseIPv6`, `formatIPv6` from `../ip/v6`.
- Produces: `BitWidth`, `BIT_WIDTHS`, `NumericValue`, `NumericForm`, `ParsedNumeric`,
  `parseNumeric(text, width?)`, `withWidth(value, width)`, `widthsFor(value)`, `maskOfWidth(width)`,
  `toDecimal`, `toHex`, `toBinary`, `toAddressForm`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  BIT_WIDTHS, parseNumeric, toBinary, toDecimal, toHex, toAddressForm, widthsFor, withWidth,
} from '@/src/lib/numeric/value';

const parsed = (text: string, width?: 8 | 16 | 32 | 48 | 64 | 128) => {
  const result = parseNumeric(text, width);
  if (!result.ok) throw new Error(`expected ${text} to parse, got ${result.code}`);
  return result.value;
};

describe('parseNumeric', () => {
  it.each([
    ['192.168.1.1', 3232235777n, 32, 'dotted-quad'],
    ['0xC0A80101', 3232235777n, 32, 'hex'],
    ['3232235777', 3232235777n, 32, 'decimal'],
    ['0b11000000101010000000000100000001', 3232235777n, 32, 'binary'],
    ['0b1100_0000', 192n, 32, 'binary'],
    ['2001:db8::1', 0x20010db8000000000000000000000001n, 128, 'ipv6'],
    ['0xFFFFFFFFFF', 0xffffffffffn, 48, 'hex'],
    ['0xFF', 255n, 32, 'hex'],
  ])('reads %s', (text, value, width, form) => {
    expect(parsed(text)).toEqual({ value: { value, width }, form });
  });

  it.each([
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['C0A8', 'MISSING_RADIX_PREFIX'],
    ['deadbeef', 'MISSING_RADIX_PREFIX'],
    ['0xZZ', 'BAD_DIGITS'],
    ['0b2', 'BAD_DIGITS'],
    ['0x', 'BAD_DIGITS'],
    ['-5', 'BAD_DIGITS'],
    ['12.5', 'BAD_DIGITS'],
    ['999.1.1.1', 'BAD_OCTET'],
    ['2001:db8:::1', 'BAD_GROUP'],
  ])('rejects %s with %s', (text, code) => {
    const result = parseNumeric(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(code);
  });

  it('honours an explicit width and refuses one too small', () => {
    expect(parsed('0xFF', 8).value).toEqual({ value: 255n, width: 8 });
    const result = parseNumeric('0x1FF', 8);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('DOES_NOT_FIT');
  });
});

describe('widths', () => {
  it('offers every width that holds the value', () => {
    expect(widthsFor(255n)).toEqual(BIT_WIDTHS);
    expect(widthsFor(256n)).toEqual([16, 32, 48, 64, 128]);
    expect(widthsFor(2n ** 127n)).toEqual([128]);
  });

  it('refuses to narrow below the value and allows widening', () => {
    const value = { value: 3232235777n, width: 32 } as const;
    const narrowed = withWidth(value, 16);
    expect(narrowed.ok).toBe(false);
    if (!narrowed.ok) expect(narrowed.code).toBe('DOES_NOT_FIT');
    expect(withWidth(value, 64).ok).toBe(true);
  });
});

describe('formatting', () => {
  const value = { value: 3232235777n, width: 32 } as const;

  it('renders each base padded to the width', () => {
    expect(toDecimal(value)).toBe('3232235777');
    expect(toHex(value)).toBe('0xC0A80101');
    expect(toBinary(value)).toBe('11000000 10101000 00000001 00000001');
    expect(toHex({ value: 255n, width: 8 })).toBe('0xFF');
    expect(toBinary({ value: 5n, width: 8 })).toBe('00000101');
  });

  it('adds the address form only where the width has one', () => {
    expect(toAddressForm(value)).toBe('192.168.1.1');
    expect(toAddressForm({ value: 1n, width: 128 })).toBe('::1');
    expect(toAddressForm({ value: 1n, width: 48 })).toBeUndefined();
  });

  it('round-trips every base', () => {
    for (const text of ['0xC0A80101', '3232235777', '192.168.1.1']) {
      const first = parsed(text).value;
      expect(parsed(toHex(first)).value).toEqual(first);
      expect(parsed(toDecimal(first)).value).toEqual(first);
      expect(parsed(toBinary(first).replace(/ /g, '0b').replace(/^0b/, '0b')).value.value).toBe(first.value);
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/numeric/value.test.ts`
Expected: FAIL — cannot resolve `@/src/lib/numeric/value`.

- [ ] **Step 3: Implement**

```ts
export type BitWidth = 8 | 16 | 32 | 48 | 64 | 128;
export const BIT_WIDTHS: readonly BitWidth[] = [8, 16, 32, 48, 64, 128];
const MIN_BARE_WIDTH: BitWidth = 32;

export interface NumericValue { readonly value: bigint; readonly width: BitWidth }
export type NumericForm = 'decimal' | 'hex' | 'binary' | 'dotted-quad' | 'ipv6';
export interface ParsedNumeric { readonly value: NumericValue; readonly form: NumericForm }

export const maskOfWidth = (width: BitWidth): bigint => (1n << BigInt(width)) - 1n;
const fits = (value: bigint, width: BitWidth): boolean => value <= maskOfWidth(width);

export function widthsFor(value: bigint): BitWidth[] {
  return BIT_WIDTHS.filter((width) => fits(value, width));
}

function resolveWidth(value: bigint, form: NumericForm, requested?: BitWidth): ParseResult<BitWidth> {
  if (requested !== undefined) {
    return fits(value, requested) ? ok(requested) : fail('DOES_NOT_FIT', '…', String(requested));
  }
  if (form === 'dotted-quad') return ok(32);
  if (form === 'ipv6') return ok(128);
  const found = BIT_WIDTHS.find((width) => width >= MIN_BARE_WIDTH && fits(value, width));
  return found === undefined ? fail('DOES_NOT_FIT', '…') : ok(found);
}
```

`parseNumeric` dispatches in this order, which is what keeps it unambiguous:

1. empty after trim → `EMPTY`
2. strip `_`
3. contains `:` → `parseIPv6`, form `ipv6`
4. matches `/^\d{1,3}(\.\d{1,3}){3}$/` → `parseIPv4`, form `dotted-quad`
5. `/^0x/i` → hex digits must match `/^[0-9a-f]+$/i` else `BAD_DIGITS`
6. `/^0b/i` → binary digits must match `/^[01]+$/` else `BAD_DIGITS`
7. `/^\d+$/` → decimal
8. `/^[0-9a-f]+$/i` → `MISSING_RADIX_PREFIX`
9. otherwise → `BAD_DIGITS`

Formatters:

```ts
export const toDecimal = (v: NumericValue): string => v.value.toString();
export const toHex = (v: NumericValue): string =>
  `0x${v.value.toString(16).toUpperCase().padStart(v.width / 4, '0')}`;
export const toBinary = (v: NumericValue): string =>
  (v.value.toString(2).padStart(v.width, '0').match(/.{8}/g) ?? []).join(' ');
export function toAddressForm(v: NumericValue): string | undefined {
  if (v.width === 32) return formatIPv4(Number(v.value));
  if (v.width === 128) return formatIPv6(v.value);
  return undefined;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/lib/numeric/value.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git add src/lib/numeric tests/lib/numeric
git commit -m "feat(numeric): width-aware values, parsing and base formatting"
git push origin main
```

---

## Task 3 — `numeric/bitwise.ts`

**Files:**
- Create: `src/lib/numeric/bitwise.ts`
- Test: `tests/lib/numeric/bitwise.test.ts`

**Interfaces:**
- Consumes: `NumericValue`, `BitWidth`, `maskOfWidth` from `./value`; `ParseResult`, `fail`, `ok`.
- Produces: `BitwiseOp`, `BITWISE_OPS`, `applyBitwise`, `not`, `shiftLeft`, `shiftRight`,
  `popCount`, `toggleBit`.

- [ ] **Step 1: Write the failing tests**

```ts
const at8 = (value: bigint) => ({ value, width: 8 } as const);

describe('applyBitwise', () => {
  it.each([
    ['and', 0b1100n, 0b1010n, 0b1000n],
    ['or', 0b1100n, 0b1010n, 0b1110n],
    ['xor', 0b1100n, 0b1010n, 0b0110n],
    ['andnot', 0b1100n, 0b1010n, 0b0100n],
  ] as const)('%s', (op, a, b, expected) => {
    const result = applyBitwise(op, at8(a), at8(b));
    expect(result.ok && result.value.value).toBe(expected);
  });

  it('refuses mismatched widths', () => {
    const result = applyBitwise('and', at8(1n), { value: 1n, width: 16 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('WIDTH_MISMATCH');
  });
});

describe('not / shifts / popCount / toggleBit', () => {
  it('complements within the width', () => {
    expect(not(at8(0xffn)).value).toBe(0n);
    expect(not(at8(0n)).value).toBe(0xffn);
    expect(not({ value: 0xffn, width: 32 }).value).toBe(0xffffff00n);
  });

  it('truncates a left shift at the width boundary', () => {
    expect(shiftLeft(at8(0b1000_0001n), 1).value).toBe(0b0000_0010n);
    expect(shiftLeft(at8(1n), 8).value).toBe(0n);
    expect(shiftLeft(at8(1n), 99).value).toBe(0n);
    expect(shiftLeft(at8(1n), -3).value).toBe(1n);
  });

  it('shifts right logically', () => {
    expect(shiftRight(at8(0b1000_0000n), 7).value).toBe(1n);
    expect(shiftRight(at8(0xffn), 8).value).toBe(0n);
  });

  it('counts set bits', () => {
    expect(popCount(at8(0n))).toBe(0);
    expect(popCount(at8(0xffn))).toBe(8);
    expect(popCount({ value: 0xffffff00n, width: 32 })).toBe(24);
  });

  it('toggles a bit counted from the most significant end, twice being identity', () => {
    expect(toggleBit(at8(0n), 0).value).toBe(0b1000_0000n);
    expect(toggleBit(at8(0n), 7).value).toBe(1n);
    expect(toggleBit(toggleBit(at8(0b0101_0101n), 3), 3).value).toBe(0b0101_0101n);
    expect(toggleBit(at8(0n), 8).value).toBe(0n);
    expect(toggleBit(at8(0n), -1).value).toBe(0n);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/numeric/bitwise.test.ts` → FAIL, module missing.

- [ ] **Step 3: Implement**

```ts
export type BitwiseOp = 'and' | 'or' | 'xor' | 'andnot';
export const BITWISE_OPS: readonly BitwiseOp[] = ['and', 'or', 'xor', 'andnot'];

export function applyBitwise(op: BitwiseOp, a: NumericValue, b: NumericValue): ParseResult<NumericValue> {
  if (a.width !== b.width) return fail('WIDTH_MISMATCH', 'Both values must have the same width.');
  const mask = maskOfWidth(a.width);
  const value =
    op === 'and' ? a.value & b.value
    : op === 'or' ? a.value | b.value
    : op === 'xor' ? a.value ^ b.value
    : a.value & (~b.value & mask);
  return ok({ value: value & mask, width: a.width });
}

export const not = (v: NumericValue): NumericValue =>
  ({ value: ~v.value & maskOfWidth(v.width), width: v.width });

const steps = (by: number): number => Math.max(0, Math.trunc(by));

export function shiftLeft(v: NumericValue, by: number): NumericValue {
  const n = steps(by);
  if (n >= v.width) return { value: 0n, width: v.width };
  return { value: (v.value << BigInt(n)) & maskOfWidth(v.width), width: v.width };
}

export function shiftRight(v: NumericValue, by: number): NumericValue {
  const n = steps(by);
  if (n >= v.width) return { value: 0n, width: v.width };
  return { value: v.value >> BigInt(n), width: v.width };
}

export function popCount(v: NumericValue): number {
  let count = 0;
  let remaining = v.value;
  while (remaining > 0n) {
    if ((remaining & 1n) === 1n) count += 1;
    remaining >>= 1n;
  }
  return count;
}

/** `index` counts from the most significant bit, matching the on-screen order. */
export function toggleBit(v: NumericValue, index: number): NumericValue {
  if (index < 0 || index >= v.width) return v;
  return { value: v.value ^ (1n << BigInt(v.width - 1 - index)), width: v.width };
}
```

- [ ] **Step 4: Run the tests** — `npx vitest run tests/lib/numeric/bitwise.test.ts` → PASS.

- [ ] **Step 5: Commit and push**

```bash
git add src/lib/numeric/bitwise.ts tests/lib/numeric/bitwise.test.ts
git commit -m "feat(numeric): bitwise operations that truncate to the value's width"
git push origin main
```

---

## Task 4 — `numeric/mask.ts` and the coverage gate

**Files:**
- Create: `src/lib/numeric/mask.ts`
- Modify: `vitest.config.ts` (threshold), `src/lib/numeric/index.ts` (barrel)
- Test: `tests/lib/numeric/mask.test.ts`

**Interfaces:**
- Consumes: `NumericValue`, `BitWidth`, `maskOfWidth`; `maskV4` from `../ip/v4`, `maskV6` from
  `../ip/v6`, `parseV4Mask` from `../ip/v4`.
- Produces: `prefixToMask(prefix, width)`, `maskToPrefix(value)`.

- [ ] **Step 1: Write the failing tests — the agreement check first**

```ts
describe('agreement with the IP library', () => {
  it('matches maskV4 for every IPv4 prefix', () => {
    for (let prefix = 0; prefix <= 32; prefix += 1) {
      expect(prefixToMask(prefix, 32).value).toBe(BigInt(maskV4(prefix)));
    }
  });

  it('matches maskV6 for every IPv6 prefix', () => {
    for (let prefix = 0; prefix <= 128; prefix += 1) {
      expect(prefixToMask(prefix, 128).value).toBe(maskV6(prefix));
    }
  });

  it('agrees with parseV4Mask on every contiguous mask', () => {
    for (let prefix = 0; prefix <= 32; prefix += 1) {
      const mask = prefixToMask(prefix, 32);
      const viaIp = parseV4Mask(formatIPv4(Number(mask.value)));
      const viaNumeric = maskToPrefix(mask);
      expect(viaIp.ok && viaIp.value).toBe(prefix);
      expect(viaNumeric.ok && viaNumeric.value).toBe(prefix);
    }
  });
});

describe('maskToPrefix', () => {
  it('refuses a non-contiguous mask', () => {
    const result = maskToPrefix({ value: 0xff00ff00n, width: 32 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NONCONTIGUOUS_MASK');
  });

  it('handles the extremes at each width', () => {
    expect(maskToPrefix({ value: 0n, width: 8 }).ok && maskToPrefix({ value: 0n, width: 8 })).toMatchObject({ value: 0 });
    expect(maskToPrefix({ value: 0xffn, width: 8 })).toMatchObject({ value: 8 });
  });
});

describe('prefixToMask', () => {
  it('clamps a prefix outside the width', () => {
    expect(prefixToMask(-5, 8).value).toBe(0n);
    expect(prefixToMask(99, 8).value).toBe(0xffn);
  });
});
```

- [ ] **Step 2: Run to verify they fail** — module missing.

- [ ] **Step 3: Implement**

```ts
export function prefixToMask(prefix: number, width: BitWidth): NumericValue {
  const clamped = Math.min(Math.max(Math.trunc(prefix), 0), width);
  const hostBits = BigInt(width - clamped);
  // No special case for /0 is needed: shifting a full mask right then left by the width gives 0.
  return { value: (maskOfWidth(width) >> hostBits) << hostBits, width };
}

export function maskToPrefix(value: NumericValue): ParseResult<number> {
  let prefix = 0;
  let seenZero = false;
  for (let index = 0; index < value.width; index += 1) {
    const bit = (value.value >> BigInt(value.width - 1 - index)) & 1n;
    if (bit === 1n) {
      if (seenZero) {
        return fail('NONCONTIGUOUS_MASK', 'A network mask must be a run of ones followed only by zeros.');
      }
      prefix += 1;
    } else {
      seenZero = true;
    }
  }
  return ok(prefix);
}
```

- [ ] **Step 4: Extend the coverage gate**

```ts
// vitest.config.ts — alongside the existing src/lib/ip entry
'src/lib/numeric/**/*.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
```

- [ ] **Step 5: Drive the numeric core to 100 %**

Run: `npm run coverage`
Expected: `src/lib/numeric` absent from the table (the reporter lists only files below 100 %) and
no threshold ERROR. Add cases for any branch the report names.

- [ ] **Step 6: Commit and push**

```bash
git add src/lib/numeric tests/lib/numeric vitest.config.ts
git commit -m "feat(numeric): width-generic masks, cross-checked against the IP library"
git push origin main
```

---

## Task 5 — `BitField` and the converter section

**Files:**
- Create: `src/ui/components/BitField.tsx`, `src/ui/views/Tools.tsx`
- Modify: `src/ui/router.ts`, `entrypoints/app/App.tsx`, `entrypoints/app/style.css`,
  `src/strings.ts`
- Test: `tests/ui/tools.test.tsx`

**Interfaces:**
- Consumes: everything from `src/lib/numeric`; `Copyable`; `consumeQueryParam`.
- Produces: the `#/tools` route; `Tools` component; `BitField` with props
  `{ value: NumericValue; onToggle?: (index: number) => void; label: string }`.

- [ ] **Step 1: Write the failing component tests**

```tsx
const typeValue = (text: string) =>
  fireEvent.input(screen.getByLabelText('Value'), { target: { value: text } });

it('shows every base for a dotted quad', async () => {
  globalThis.location.hash = '#/tools';
  render(<App version="1.2.0" />);
  typeValue('192.168.1.1');

  expect(await screen.findByLabelText(/Copy Decimal: 3232235777/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Copy Hexadecimal: 0xC0A80101/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Copy IPv4 address: 192\.168\.1\.1/)).toBeInTheDocument();
});

it('disables widths too small for the value', async () => {
  globalThis.location.hash = '#/tools';
  render(<App version="1.2.0" />);
  typeValue('192.168.1.1');
  expect(await screen.findByRole('radio', { name: '8 bits' })).toBeDisabled();
  expect(screen.getByRole('radio', { name: '64 bits' })).toBeEnabled();
});

it('flips a bit when it is clicked', async () => {
  globalThis.location.hash = '#/tools';
  render(<App version="1.2.0" />);
  typeValue('0x00');
  const bits = await screen.findAllByRole('button', { name: /^Bit 31/ });
  fireEvent.click(bits[0] as HTMLElement);
  await waitFor(() => expect(screen.getByLabelText(/Copy Decimal: 1$/)).toBeInTheDocument());
});

it('explains a bare hexadecimal value', async () => {
  globalThis.location.hash = '#/tools';
  render(<App version="1.2.0" />);
  typeValue('C0A8');
  expect(await screen.findByRole('alert')).toHaveTextContent(/Prefix hexadecimal with 0x/);
});

it('seeds itself from the URL', async () => {
  globalThis.location.hash = '#/tools?v=0xFF&w=8';
  render(<App version="1.2.0" />);
  expect(await screen.findByDisplayValue('0xFF')).toBeInTheDocument();
  expect(screen.getByLabelText(/Copy Decimal: 255/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify they fail** — no `/tools` route yet.

- [ ] **Step 3: Add the route**

`src/ui/router.ts`: add `'tools'` to `RouteName` and `ROUTE_NAMES`.
`entrypoints/app/App.tsx`: add `{ name: 'tools', path: '/tools', label: strings.nav.tools }`
before Settings, and a `{route.name === 'tools' && <Tools … />}` branch.

- [ ] **Step 4: Implement `BitField`**

```tsx
export function BitField({ value, onToggle, label }: BitFieldProps) {
  const bits = value.value.toString(2).padStart(value.width, '0').split('');
  return (
    <ol class="nc-bits" aria-label={label}>
      {bits.map((bit, index) => (
        <li key={index} class={index > 0 && index % 8 === 0 ? 'is-group-start' : undefined}>
          <button
            type="button"
            class={`nc-bits__cell${bit === '1' ? ' is-set' : ''}`}
            aria-label={`Bit ${value.width - 1 - index}, value ${bit}`}
            onClick={() => onToggle?.(index)}
          >
            <span class="nc-mono">{bit}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 5: Implement the converter section of `Tools.tsx`**

State: `text` (the input) and `width` (`BitWidth | undefined`, meaning "follow the input"). The
result is `useMemo(() => parseNumeric(text, width), [text, width])`. A bit click re-renders by
writing the toggled value back into `text` as hex, which keeps the input the single source of
truth. The width radiogroup renders `BIT_WIDTHS`, disabling any width not in
`widthsFor(currentValue)`.

- [ ] **Step 6: Add the strings and the styles**

`strings.ts` gains `nav.tools: 'Tools'` and a `tools` block with `title`, `subtitle`, `index`
entries, `valueLabel: 'Value'`, `widthLabel: 'Width'`, `widthOption: (bits) => \`${bits} bits\``,
`detected: (form) => …`, and the row labels `Decimal`, `Hexadecimal`, `Binary`,
`IPv4 address`, `IPv6 address`, plus `setBits: (count) => …` and `bitHint`.
`style.css` gains `.nc-bits`, `.nc-bits__cell`, `.is-set`, `.is-group-start`, reusing the
`--bit-network` / `--bit-host` tokens.

- [ ] **Step 7: Run the tests** — `npx vitest run tests/ui/tools.test.tsx` → PASS.

- [ ] **Step 8: Commit and push**

```bash
git add -A
git commit -m "feat(tools): the base converter, with a bit field you can click"
git push origin main
```

---

## Task 6 — Bitwise and mask sections, exports, cross-link

**Files:**
- Modify: `src/ui/views/Tools.tsx`, `src/lib/export/markdown.ts`, `src/lib/export/plain.ts`,
  `src/ui/views/Calculator.tsx`, `src/strings.ts`
- Test: `tests/ui/tools.test.tsx` (extend), `tests/lib/export/reports.test.ts` (extend)

**Interfaces:**
- Consumes: `applyBitwise`, `not`, `shiftLeft`, `shiftRight`, `popCount`, `prefixToMask`,
  `maskToPrefix`.
- Produces: `converterToMarkdown(value: NumericValue, includeFooter?: boolean): string` and
  `converterToPlain(value, includeFooter?)`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('applies a bitwise AND', async () => {
  globalThis.location.hash = '#/tools';
  render(<App version="1.2.0" />);
  fireEvent.input(screen.getByLabelText('Operand A'), { target: { value: '10.0.0.1' } });
  fireEvent.input(screen.getByLabelText('Operand B'), { target: { value: '255.255.0.0' } });
  await waitFor(() => expect(screen.getByLabelText(/Copy Result: 10\.0\.0\.0/)).toBeInTheDocument());
});

it('converts a prefix to a mask and back', async () => {
  globalThis.location.hash = '#/tools';
  render(<App version="1.2.0" />);
  fireEvent.input(screen.getByLabelText('Prefix length'), { target: { value: '24' } });
  await waitFor(() => expect(screen.getByDisplayValue('255.255.255.0')).toBeInTheDocument());

  fireEvent.input(screen.getByLabelText('Subnet mask'), { target: { value: '255.255.255.192' } });
  await waitFor(() => expect(screen.getByDisplayValue('26')).toBeInTheDocument());
});
```

```ts
it('renders the converter result as Markdown', () => {
  const markdown = converterToMarkdown({ value: 3232235777n, width: 32 });
  expect(markdown).toContain('| Decimal | 3232235777 |');
  expect(markdown).toContain('| Hexadecimal | 0xC0A80101 |');
  expect(markdown).toContain('_Generated by NetCarve — attv.uk_');
});
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement the two sections**

Bitwise: operand A, an op select over `['and','or','xor','andnot','not','shl','shr']`, operand B
(replaced by a number input when the op is a shift, hidden when the op is `not`), and a result row
plus a read-only `BitField`. Both operands are parsed at the panel width, so `WIDTH_MISMATCH`
cannot arise from the UI.

Masks: a prefix number input and a mask text input, each driving the other through
`prefixToMask` / `maskToPrefix`, with the wildcard (`not(mask)`) and `popCount` shown beside them.

- [ ] **Step 4: Implement the exporters**

`converterToMarkdown` builds a two-column table from the same rows the panel renders, through the
existing `markdownTable` and `withFooter`; `converterToPlain` mirrors it with the plain renderer
already in `plain.ts`.

- [ ] **Step 5: Add the calculator cross-link**

In `Calculator.tsx`, beside the headline, an anchor to
`#/tools?v=<network address>&w=<32|128>` labelled *Open in converter*.

- [ ] **Step 6: Run the whole unit suite** — `npx vitest run` → all green.

- [ ] **Step 7: Commit and push**

```bash
git add -A
git commit -m "feat(tools): bitwise and mask sections, exports and a link from the calculator"
git push origin main
```

---

## Task 7 — End-to-end, docs and the release

**Files:**
- Create: `tests/e2e/tools.spec.ts`
- Modify: `tests/e2e/a11y.spec.ts`, `README.md`, `docs/qa.md`, `docs/store-listing.md`
- Release: v1.2.0

- [ ] **Step 1: Write the end-to-end spec**

```ts
test('converts, disables impossible widths, flips a bit and exports', async ({ app }) => {
  await goToRoute(app, '/tools');
  await app.getByLabel('Value').fill('192.168.1.1');
  await expect(app.getByLabel(/Copy Hexadecimal: 0xC0A80101/)).toBeVisible();
  await expect(app.getByRole('radio', { name: '8 bits' })).toBeDisabled();

  await app.getByRole('button', { name: 'Bit 0, value 1' }).click();
  await expect(app.getByLabel(/Copy Decimal: 3232235776/)).toBeVisible();

  await app.getByRole('button', { name: /Copy as Markdown/ }).click();
  expect(await readClipboard(app)).toContain('| Hexadecimal |');
});
```

- [ ] **Step 2: Add `/tools` to the accessibility sweep**

Add the route to the list `tests/e2e/a11y.spec.ts` already iterates.

- [ ] **Step 3: Run everything**

```bash
npm run typecheck && npx vitest run && npm run test:e2e
```
Expected: all green, `src/lib/numeric` at 100 % branches.

- [ ] **Step 4: Update the docs**

README feature table gains the Tools row; `docs/qa.md` gains a Tools section (width switching,
disabled widths, bit clicking, mask round-trip); `docs/store-listing.md`'s description gains a
sentence about the converter.

- [ ] **Step 5: Measure the bundle**

```bash
npm run build
cd .output/chrome-mv3 && find . -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \) \
  -exec sh -c 'gzip -c "$1" | wc -c' _ {} \; | awk '{s+=$1} END {printf "%.1f KB\n", s/1024}'
```
Expected: comfortably under 150 KB.

- [ ] **Step 6: Release**

```bash
node scripts/release.mjs 1.2.0 "the tools page — base converter and bit mathematics" notes.md
```

---

## Self-review notes

- **Spec coverage:** FR-TOOL-01 → Task 2 (`resolveWidth`) and Task 5 (selector); FR-TOOL-02 →
  Task 3 (truncation) — the arithmetic half has no v1.2 operations, and lands with v1.3;
  FR-TOOL-03 → Task 2 (`widthsFor`, `withWidth`) and Task 5 (disabled options); FR-TOOL-04 →
  Task 2 (dispatch order); FR-TOOL-05 → Task 3 (`WIDTH_MISMATCH`) and Task 6 (single selector);
  FR-TOOL-06 → Task 5 (`BitField`); FR-TOOL-07 → Task 5 (URL seed) and Task 6 (cross-link);
  FR-TOOL-08 → Task 4 (threshold). §3.3 error move → Task 1. §6 budget → Task 7.
- **Type consistency:** `NumericValue`, `BitWidth`, `ParsedNumeric` and `maskOfWidth` are defined
  in Task 2 and used unchanged in Tasks 3–6. `toggleBit`'s `index` counts from the most
  significant bit in both the library (Task 3) and `BitField`'s rendering order (Task 5).
- **Deliberate gap:** the bit-field `aria-label` numbers bits from the least significant end
  (`Bit 31` is the leftmost of 32), while `toggleBit`'s `index` counts from the left. Task 5's
  component converts between the two in one place, and both tests assert the visible numbering.
