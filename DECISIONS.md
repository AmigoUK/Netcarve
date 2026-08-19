# Decisions

Engineering decisions taken while implementing the specification in `docs/spec.md`.
Each entry records the ambiguity, the decision and the reasoning.

---

## D1 — Preact is wired through `@preact/preset-vite`, not a WXT module

**Ambiguity:** §3.1 mandates WXT + Preact, but WXT publishes official framework modules only for
React, Vue, Svelte and Solid; `@wxt-dev/module-preact` does not exist on npm.

**Decision:** register `@preact/preset-vite` in `wxt.config.ts` via the `vite` hook. This is the
documented WXT escape hatch for frameworks without a module, and gives the same JSX transform,
aliasing and Fast Refresh behaviour.

---

## D2 — Repository layout keeps `entrypoints/` at the root and libraries under `src/`

**Ambiguity:** the spec references both `entrypoints/popup/` and `src/lib/ip/`.

**Decision:** WXT's default `srcDir` (the project root) is kept, so entrypoints live at
`entrypoints/**` and all framework-free domain code lives at `src/**`, exactly as the spec's paths
imply. Tests live in `tests/**`, mirroring the `src` tree.

---

## D3 — Open question §14.1 — the product is called **NetCarve**

The spec's own working title, the repository name (`AmigoUK/Netcarve`) and every requirement ID
prefix already say NetCarve. Renaming to PrefixLens would invalidate the store listing copy,
the icon and the `netcarve:` storage key prefix for no functional gain. Domain availability
remains a pre-M4 checklist item in `docs/qa.md`.

---

## D4 — Open question §14.2 — the 1 024-leaf planner limit is visible in Settings

Shown as a read-only informational line. A hard limit the user can hit is far less frustrating
when it is discoverable beforehand, and it costs one line of copy.

---

## D5 — Open question §14.3 — v1.0 ships an English store listing only

NFR-I18N-01 keeps every string in `src/strings.ts`, so a Polish locale remains a future item
(§13) without refactoring. Shipping one listing keeps the M4 review surface small.

---

## D6 — `ParseError` is returned, never thrown

§4.2 writes the signatures as `T | ParseError`. Every parser therefore returns a discriminated
union with `ok: false`, and callers narrow through the exported `isParseError` guard. No parsing
path throws, so the UI can never be taken down by malformed input.

---

## D7 — Warnings travel with successful parses

§4.2 mentions a `warnings` field for zone IDs and assumed prefixes, but the signature table shows
a bare return value. Parsers therefore return `ParseOk<T> = { ok: true; value: T; warnings: Warning[] }`
so a warning never has to masquerade as an error.

---

## D8 — Credit footer placement (attv.uk house rule)

The `AppFooter` renders on every full-page app route. It is deliberately **omitted from the popup**,
where the viewport is ~400 × 600 px and every row competes with the result table; the popup instead
links to the app, whose footer carries the credit. The About block in Settings repeats it in full.

---

## D9 — Release cadence

Every task in `docs/superpowers/plans/2026-08-19-netcarve.md` ends in its own SemVer bump, annotated
tag and GitHub Release, per the attv.uk house rules. Pre-1.0 minor bumps mark feature milestones;
`v1.0.0` marks the M4 store-ready build.

---

## D10 — IPv6 "usable" range

§4.4 states usable equals total for IPv6, with subnet-router anycast mentioned only as a footnote.
`usableRange` therefore returns first = network and last = last address for every IPv6 prefix,
and the UI shows the anycast footnote for prefixes shorter than /127.

---

## D11 — VLSM sizing has a floor of four addresses

**Ambiguity:** FR-VLSM-02 gives `needed = requiredHosts + 2`, rounded up to a power of two. For
a one-host requirement that yields two addresses — a `/31` — even when the "allow /31" toggle is
off.

**Decision:** without the toggle the block size never drops below four addresses, so a `/31`
only ever appears when the user has asked for it. With the toggle on, requirements of one or two
hosts take a `/31`, which is what the setting is for.

---

## D12 — The conflict sweep is a stack, and reports one chain per innermost block

**Ambiguity:** FR-CONF-03 asks for containment *chains* but does not say how overlapping chains
should be grouped.

**Decision:** the sorted list is swept once with a stack, so whatever sits on top when a block
arrives is its nearest container. Each innermost block then yields one chain, walked back up
through its containers — so `10.0.0.0/8 ⊃ 10.1.0.0/16` and `10.0.0.0/8 ⊃ 10.2.0.0/16` are
reported as two chains rather than one branching tree. That reads better in a report and keeps
the output flat enough to export.

Duplicate entries are grouped separately, by canonical block, before the sweep runs, so an
identical pair is never also reported as containment.

---

## D13 — The planner is mounted with `key={project.id}`

Opening a different project must not inherit the previous plan's undo history. Rather than
resetting state from an effect — which raced with the first edit — the planner is keyed by
project id, so Preact remounts it and the history starts clean.

---

## D14 — The VLSM solver has no "Solve" button

The allocation is deterministic and costs microseconds, so it recomputes as the user types. A
button would only add a step between changing a host count and seeing what it does to the plan.

---

## D15 — Leftover VLSM blocks are merged back together

The splitting step naturally leaves a ladder of fragments. The free list merges any two halves
that are still whole before it is shown, so it reports the largest blocks actually available
rather than the shape the algorithm happened to leave behind.
