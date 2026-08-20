# Tools: base converter and bit mathematics — design

**Status:** approved 20 August 2026 · **Target release:** v1.2.0 · **Route:** `#/tools`

Extends the product specification (`docs/spec.md`), which lists this class of work under §13
"Future ideas". Requirement IDs below use the `FR-TOOL-*` prefix so commits and tests can cite
them the way the rest of the codebase cites `FR-CALC-*` and `FR-VLSM-*`.

---

## 1. Scope

NetCarve's full-page app gains a **Tools** page holding, in this release:

- a **base converter** — one value shown simultaneously in decimal, hexadecimal, binary and, where
  the width allows, its address form;
- **bitwise operations** on values of a chosen width;
- **mask and prefix conversion**, both directions, with the wildcard and the set-bit count.

### Agreed but out of scope here

The brainstorm covered five families of operations. They ship in sequence, and **each later stage
gets its own design document** rather than being sketched here — a spec full of "to be decided"
is worse than no spec:

| Release | Content |
|---|---|
| **v1.2.0** | this document: `numeric/` core, base converter, bitwise, masks |
| v1.3.0 | address arithmetic (± N, distance, N-th host) and range aggregation at `#/aggregate` |
| v1.4.0 | MAC and EUI-64; bandwidth, MTU and MSS |

### Non-goals

- **No expression language.** Structured fields were chosen over a parser for `10.0.0.0/8 & 255.0.0.0`.
  A lexer, parser and evaluator would be the most expensive part of the whole feature and the
  hardest to give good error messages; the panel-and-forms shape covers the same ground.
- **No octal.** It carries no meaning in network work.
- **No new storage key.** The page holds no state worth persisting (see §4.3).

---

## 2. Width and overflow

This is the only place a calculator of this kind can lie quietly, so it is settled first.

### FR-TOOL-01 — width is explicit, never inferred silently

The panel carries a visible width selector: **8, 16, 32, 48, 64, 128 bits**. The initial value
follows the form of the input, and the user may override it, after which every base re-renders
immediately.

| Input form | Initial width |
|---|---|
| Dotted quad (`192.168.1.1`) | 32 |
| IPv6 literal (`2001:db8::1`) | 128 |
| Bare number (`0xFF`, `3232235777`, `0b1010`) | smallest standard width that holds it, but never below 32 |

The floor of 32 matters: network work is overwhelmingly 32-bit, and quietly treating `0xFF` as an
8-bit value would surprise. The selector always shows what is in force.

Without an explicit width, `NOT 0xFF` has no single answer — `0x00` at 8 bits, `0xFFFFFF00` at 32.
Inferring the width from the digit count would be a guess that is wrong silently.

### FR-TOOL-02 — overflow behaviour depends on the kind of operation

| Kind | Behaviour | Reason |
|---|---|---|
| Arithmetic (`+`, `−`, and the v1.3 address operations) | **Refuses**, naming how far outside the range the result fell | An address outside the space is meaningless. `255.255.255.255 + 1` reports that the result does not fit in 32 bits rather than returning `0.0.0.0` |
| Bitwise (`AND`, `OR`, `XOR`, `AND NOT`, `NOT`, `<<`, `>>`) | **Truncates to the width** | Discarding bits is what a shift means, and the truncation is visible on the bit field |

A negative result is a refusal too: `10.0.0.1 − 300` reports that the result is below `0.0.0.0`.

This matches the rest of the codebase, where parsers never throw but do refuse and explain, and
`splitOnce` declines at the maximum prefix rather than inventing a result.

### FR-TOOL-03 — narrowing the width cannot lose data

Widths too small to hold the current value are **disabled** in the selector, with the reason in
their `title`. There is no truncation-on-narrowing path and therefore no error state to handle,
because the state cannot be entered. `withWidth` still refuses in the library, for callers and
tests that reach it directly.

---

## 3. The `numeric/` module

### 3.1 Placement

Following the codebase's existing shape — pure domain code under `src/lib/<area>/`, views as thin
layers over it — the core lands in `src/lib/numeric/`:

```
src/lib/numeric/value.ts     NumericValue, BitWidth, parseNumeric, withWidth, formatters
src/lib/numeric/bitwise.ts   applyBitwise, not, shifts, popCount, toggleBit
src/lib/numeric/mask.ts      prefixToMask, maskToPrefix
src/lib/numeric/index.ts     barrel
```

Unification goes exactly as far as the concepts do. Bases, bitwise operations and (in v1.3)
address arithmetic are genuinely one idea — a number of known width — and share this core. MAC,
bandwidth and aggregation are not, and will get their own modules rather than being bent into
this type.

### 3.2 API

```ts
export type BitWidth = 8 | 16 | 32 | 48 | 64 | 128;
export const BIT_WIDTHS: readonly BitWidth[];

/** A number of known width. Always 0 <= value < 2^width. */
export interface NumericValue {
  readonly value: bigint;
  readonly width: BitWidth;
}

export type NumericForm = 'decimal' | 'hex' | 'binary' | 'dotted-quad' | 'ipv6';

export interface ParsedNumeric {
  readonly value: NumericValue;
  /** The spelling used, which drives the initial width and the "detected as" chip. */
  readonly form: NumericForm;
}

export function parseNumeric(text: string, width?: BitWidth): ParseResult<ParsedNumeric>;
export function withWidth(value: NumericValue, width: BitWidth): ParseResult<NumericValue>;
export function widthsFor(value: bigint): readonly BitWidth[];   // which widths can hold it

export function toDecimal(value: NumericValue): string;
export function toHex(value: NumericValue): string;              // `0x`, padded to the width
export function toBinary(value: NumericValue): string;           // padded, grouped in bytes
export function toAddressForm(value: NumericValue): string | undefined;  // quad at 32, IPv6 at 128

export type BitwiseOp = 'and' | 'or' | 'xor' | 'andnot';
export function applyBitwise(op: BitwiseOp, a: NumericValue, b: NumericValue): ParseResult<NumericValue>;
export function not(value: NumericValue): NumericValue;
export function shiftLeft(value: NumericValue, by: number): NumericValue;
export function shiftRight(value: NumericValue, by: number): NumericValue;
export function popCount(value: NumericValue): number;
/** `index` counts from the most significant bit, matching the on-screen order. */
export function toggleBit(value: NumericValue, index: number): NumericValue;

export function prefixToMask(prefix: number, width: BitWidth): NumericValue;
export function maskToPrefix(value: NumericValue): ParseResult<number>;  // contiguous masks only
```

### FR-TOOL-04 — a radix prefix is required for bare numbers

`0xC0A8` is accepted; `C0A8` is not. `123` is both a decimal and a hexadecimal number, and
guessing produces exactly the class of silent mistake this design exists to avoid. Binary
likewise requires `0b`. Address forms are unambiguous and need no prefix. Underscores are
stripped before parsing, so `0b1100_0000` works.

### FR-TOOL-05 — one width per panel

The view has a single width selector, so both operands of a bitwise operation are parsed at the
same width and a mismatch cannot arise through the interface. The library still guards it —
`applyBitwise` refuses with `WIDTH_MISMATCH` — for direct callers and tests.

### 3.3 Shared error vocabulary

`ParseResult`, `ParseError` and the `errorMessage` mapping are already the whole project's
vocabulary for "this input did not work", but they live in `src/lib/ip/errors.ts`. A `numeric/`
module importing from `ip/` would misstate the dependency, so the file moves to
`src/lib/errors.ts`. One file, roughly eight import sites, every one caught by the compiler.

New codes: `BAD_DIGITS`, `MISSING_RADIX_PREFIX`, `DOES_NOT_FIT`, `NEGATIVE_RESULT`,
`WIDTH_MISMATCH`. `NONCONTIGUOUS_MASK` already exists and is reused.

---

## 4. The `#/tools` view

### 4.1 Layout

One scrollable page with an index across the top, following the shape of the existing tool pages:

```
Tools                          Base converter · Bitwise · Masks & prefixes
──────────────────────────────────────────────────────────────────────────
BASE CONVERTER
  Width   (8)(16)(●32)(48)(64)(128)          detected: dotted quad
  Value   [ 192.168.1.1                                        ]
  DEC     3232235777                                        ⧉
  HEX     0xC0A80101                                        ⧉
  BIN     11000000 10101000 00000001 00000001               ⧉
  IPv4    192.168.1.1                                       ⧉
  ┌─┬─┬─┬─┬─┬─┬─┬─┐ ┌─┬─┬─┬─┬─┬─┬─┬─┐ …    click a bit to flip it
  │1│1│0│0│0│0│0│0│ │1│0│1│0│1│0│0│0│       set bits: 8
  Copy as Markdown

BITWISE
  A  [ 10.0.0.1 ]   op [ AND ▾ ]   B  [ 255.255.0.0 ]
  =  10.0.0.0   ·  0x0A000000   ·  bit field

MASKS & PREFIXES
  prefix [ /24 ]  ↔  mask [ 255.255.255.0 ]
  wildcard 0.0.0.255      set bits 24
```

Nav grows from five entries to six: `Calculator · Projects · VLSM solver · Conflicts · Tools ·
Settings`. The label stays the general **Tools** because v1.3 and v1.4 add address arithmetic,
MAC and bandwidth to this same page; the index line carries the specificity.

### FR-TOOL-06 — the bit field is an input, not decoration

Each bit is a button. Clicking flips it and every base updates. For mask work this is the point of
the whole page: click a bit, watch the prefix change.

A new `BitField.tsx` component renders it — `BitRuler` is not extended, because its props carry a
prefix boundary and a network/host split that do not exist here, and clickability needs a
different contract. Two thin components over a shared CSS block is more honest than one component
with a mode. Both draw on the same `--bit-*` tokens, so the visual language stays consistent; each
carries its own legend saying what a filled cell means.

### 4.2 Reused components

`Copyable` for every output row, `ExportBar` for the converter panel only (it already honours the
*default copy format* setting), and the existing panel, field and label styles. Markdown and plain
renderers for the converter result go into the existing `src/lib/export/markdown.ts` and
`plain.ts`.

### FR-TOOL-07 — state comes from the URL, not from storage

The page reads `#/tools?v=<value>&w=<width>` once through the existing `consumeQueryParam`, and
writes nothing back. No new storage key, and the seed gives later releases a way to hand a value
over.

The calculator result gains a small **Open in converter** link. Three lines, and it stops the new
page being a nav entry nobody discovers.

### 4.3 Copy

Every new string goes into `src/strings.ts` under a `tools` key, in British English, per
NFR-I18N-01.

---

## 5. Testing

### FR-TOOL-08 — the numeric core holds 100 % branch coverage

`NFR-QUAL-01` pins `src/lib/ip/**`; the threshold in `vitest.config.ts` extends to
`src/lib/numeric/**`. It is the same kind of code — pure arithmetic that, when wrong, returns a
plausible answer rather than failing.

### 5.1 Agreement with the existing library

The strongest test in the set. The new mask functions are width-generic, so they must produce
exactly what the long-proven IP code produces:

```
for p in 0..32    prefixToMask(p, 32)  === maskV4(p)
for p in 0..128   prefixToMask(p, 128) === maskV6(p)
maskToPrefix agrees with parseV4Mask on every contiguous mask
```

Two independent implementations agreeing across the whole domain is worth more than any list of
cases, and it answers why the generic version exists at all.

### 5.2 The rest

- **Parsing:** tables of accepted spellings and rejections — `C0A8` without a prefix, `0xZZ`, a
  value wider than the chosen width, an empty input, a negative sign.
- **Width:** inference per form, the floor of 32 for bare numbers, `widthsFor` matching what the
  selector disables, `withWidth` refusing to narrow below the value.
- **Round-trip:** `parse ∘ format` over a seeded random generator for every base and width — the
  pattern already used for the conflict checker's brute-force oracle.
- **Bitwise:** truth tables at 8 bits, where they can be checked by eye; shifts truncating exactly
  at the width boundary; `not` at every width; `popCount`; `toggleBit` applied twice as identity.
- **Components:** the width switch re-rendering every base, a rejected spelling showing the
  friendly message, a bit click changing DEC and HEX, masks and prefixes converting both ways.
- **End-to-end, headless:** `#/tools` added to the existing axe accessibility spec, plus one walk
  through the real extension — type a dotted quad, confirm the 8-bit width is disabled, flip a
  bit, copy as Markdown and read the clipboard back.

---

## 6. Accessibility and budget

- The width selector is a radiogroup; each bit button carries a label naming its position and
  value; every output row is already a button through `Copyable`. WCAG 2.1 AA as elsewhere
  (NFR-A11Y-01).
- The page adds pure computation and a handful of components. The bundle sits at roughly 44 KB
  gzipped against a 150 KB budget (NFR-SIZE-01), so there is ample room, but the figure is
  re-measured at release.
