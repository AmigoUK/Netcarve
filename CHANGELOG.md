# Changelog

All notable changes to **NetCarve** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

## [1.2.0] — 2026-08-20

### Added
- A **Tools** page at `#/tools`, holding three sections (FR-TOOL-01 … FR-TOOL-08; design in
  `docs/superpowers/specs/2026-08-20-tools-converter-design.md`):
  - **Base converter** — one value shown at once in decimal, hexadecimal, binary and, where the
    width has one, its address form. The width is an explicit control from 8 to 128 bits, not a
    guess: `NOT 0xFF` is `0x00` at eight bits and `0xFFFFFF00` at thirty-two, so inferring it
    from the digit count would answer a question nobody asked. Widths too small for the current
    value are disabled rather than truncating.
  - **Bitwise** — AND, OR, XOR, AND NOT, NOT and both shifts on real addresses, with the result
    in every base. Operand A settles the width and B is read at it, so a result never mixes
    widths.
  - **Masks & prefixes** — prefix and dotted mask driving each other, with the wildcard and the
    set-bit count. IPv4 only, and it says so: a dotted mask is an IPv4 spelling.
- The **bit display is an input**: every bit is a button, clicking flips it, and each is named
  the way engineers name bits — the leftmost of thirty-two is bit 31.
- `src/lib/numeric/`, a new pure module for numbers of known width — parsing across bases,
  formatting, bitwise operations and width-generic masks. Held to 100 % branch coverage
  alongside `src/lib/ip` (FR-TOOL-08).
- Copy as Markdown or plain text from the converter, honouring the default-copy-format setting,
  and an *Open in converter* link on the calculator result that carries the network address over.

### Changed
- A bare `C0A8` is refused with an explanation rather than read as decimal or hex — `123` is
  both, and guessing there is the silent mistake the whole design avoids (FR-TOOL-04).
- The shared parse-error vocabulary moved from `src/lib/ip/errors.ts` to `src/lib/errors.ts`,
  since it now serves two domains.

### Tests
- 715 unit and component tests, 113 end-to-end. New: 100 cases across the numeric core —
  including a seeded round-trip of parse ∘ format over every base and width, and an agreement
  check pinning the width-generic masks to `maskV4`, `maskV6`, `parseV4Mask` and `wildcardV4`
  across their whole domains — 25 component tests, 8 end-to-end and the tools page added to the
  axe accessibility sweep.
- Bundle: 48.4 KB gzipped against the 150 KB budget.

## [1.1.2] — 2026-08-20

### Added
- **Every release now carries an installable package.** `scripts/release.mjs` builds
  `netcarve-<version>-chrome.zip` after the version bump — so the manifest inside matches the
  tag — and attaches it to the GitHub Release, with the Load-unpacked steps appended to the
  release notes.
- `docs/install.md`: installing without a toolchain. Chrome, Edge, Brave and Opera, what the
  permissions screen should say, how to update an existing install without losing your
  projects, how to remove it, and the four snags people actually hit.
- `tests/e2e/package.spec.ts`: three checks against the **archive itself**, not the build
  directory — that it unpacks straight to a loadable folder with every required file, that its
  manifest declares MV3, the matching version and exactly `storage` + `contextMenus` with no
  host permissions and no content scripts, and that a browser loads it and the popup calculates.
- CI packages the archive, so that spec runs on every push, and uploads it as a build artifact.

### Changed
- README opens with how to install a release, and links the guide.

## [1.1.1] — 2026-08-20

### Changed
- The end-to-end suite and the store-asset generator now run **headless**. Chromium's new
  headless mode loads unpacked extensions, so `xvfb-run` is gone from `npm run test:e2e`, from
  `npm run screenshots` and from CI. `channel: 'chromium'` is what makes it work — the default
  `chromium-headless-shell` has no extension support (DECISIONS D16).
- `npm run test:e2e:xvfb` is replaced by `npm run test:e2e:headed`, which sets
  `NETCARVE_HEADED=1` and opens a real window for debugging a selector.

### Fixed
- The popup's bit ruler no longer overflows the 400 px popup: the 32 IPv4 bit cells now share
  the width instead of scrolling, so all four octets stay in frame. The first headless capture
  of the store screenshot is what exposed it — the final octet was cut in half.

### Added
- An end-to-end assertion that the popup ruler never overflows its container. Verified to fail
  (20 px of overflow) with the fix reverted.

### Verified
- 586 unit and component tests, 100 end-to-end tests, all passing headless.
- Store assets regenerated from this build; four of the five screenshots came out byte-identical
  to the headed run, which is a decent reproducibility signal.

## [1.1.0] — 2026-08-19

### Added
- Plain-text export. Settings has offered a **Default copy format** of Markdown or plain text
  since 1.0.0, but nothing read it: every copy button produced a Markdown table whatever the
  setting said. Choosing *Plain text* now switches the calculator, the planner, the solver and
  the conflict checker to a space-aligned rendering of exactly the same content — same fields,
  same columns, same credit line — and relabels the button *Copy as text*. For a ticket, a
  terminal or an email that renders nothing.
- Fault-injection coverage for the paths a user cannot click their way to: a refused storage
  write (the plan stays on screen and stays editable, with the "could not save" notice shown),
  a corrupt root quarantined on load without taking its project with it, and an unreadable
  settings blob falling back to the defaults.

## [1.0.2] — 2026-08-19

### Fixed
- The planner's "add a root block" form rendered as a 350 px-tall column with the input and
  the button stranded at opposite ends. `.nc-row` never stated its own `flex-direction`, so on
  the one element that also carries `.nc-section` the column direction won and
  `.nc-field--grow`'s 16 rem basis became a height. `.nc-row` is now explicitly a row.
- A VLSM requirement's name sat half a screen from its own host count: the field grew to fill
  the panel while the input inside stayed at its 12 rem cap. Requirement rows are now capped at
  34 rem and the name input fills its field.

### Added
- `npm run screenshots` — a Playwright job that seeds a realistic plan and writes the five
  1280 × 800 Chrome Web Store screenshots into `docs/store/screenshots/`, so the listing images
  are regenerated from the real build rather than retouched by hand.
- Layout regression tests for both fixes above, so neither can come back unnoticed.

## [1.0.1] — 2026-08-19

### Added
- An end-to-end suite (Playwright, 91 tests) that drives the real MV3 build in Chrome rather
  than a jsdom stand-in: packaging and manifest invariants, the popup, every view, the
  context-menu contract, exports and imports through real downloads and file pickers, storage
  persistence across reloads, and a privacy sweep that fails if anything in the bundle can
  reach the network.
- Automated WCAG 2.1 A/AA auditing (axe-core) on every route, in both themes and in the popup.

### Fixed
- The prefix stepper computed from the debounced result, so two clicks inside 150 ms both used
  the same stale prefix and the second was swallowed. It now steps from a pending value that
  re-syncs when a fresh result lands.
- `--ink-faint`, the colour of every micro-label and hint, failed WCAG AA: 3.0:1 against the
  page in the light theme and 4.2:1 against a panel in the dark one. Both are now above 4.7:1.
- The bit ruler scrolls sideways in the popup but could not be reached by keyboard, so the bits
  past the fold were unreadable without a mouse (WCAG 2.1.1).

### Changed
- Module preloading is off in the build. Extension pages load from disk, so it bought nothing —
  but Vite's polyfill put a literal `fetch(` in the bundle, which contradicts the store
  listing's "no network requests at all", and made Chrome log a cross-world preload warning on
  every page load.

## [1.0.0] — 2026-08-19

First feature-complete release: every requirement in the specification (`docs/spec.md`) is
implemented, tested and building.

### Added
- `docs/qa.md`: the manual QA checklist — install and permissions, the popup, the context-menu
  flow on a real page, the planner walkthrough, keyboard-only operation, persistence across a
  browser restart, export and import, the solver and conflict checker, dark mode, contrast, and
  the pre-submission gates.
- `docs/store-listing.md`: Chrome Web Store copy — name, short and long descriptions, the
  single-purpose statement, per-permission justifications, the data-use declarations and the
  screenshot shot list.
- `docs/privacy.md`: the privacy policy to publish at attv.uk, listing exactly what is stored,
  where, and what NetCarve does not do.
- `DECISIONS.md` completed with the five decisions taken while building the solver, the
  conflict sweep and the planner's state ownership.
- Report exporters covered by tests, and README quality gates recording the measured figures.

### Changed
- The 512 px icon moved out of the extension bundle into `docs/store/`, where it belongs — the
  manifest now ships exactly the five sizes Chrome asks for.

### Verified for this release
- 567 tests across 22 files, all passing.
- `src/lib/ip/**` at 100 % statement, branch, function and line coverage; the whole of
  `src/lib` at 98.4 % statements.
- Manifest permissions are exactly `storage` and `contextMenus`, with no host permissions.
- No `fetch`, `XMLHttpRequest`, WebSocket, remote font or remote asset anywhere in the source.
- Production bundle: 149.8 KB on disk, **~44 KB gzipped** — comfortably inside the 150 KB
  budget.
- No `any` anywhere in `src/lib`; `tsc --noEmit` clean under `strict`.

## [0.13.0] — 2026-08-19

### Added
- The background service worker (F6). It registers exactly one context-menu item — id
  `netcarve-analyse`, `contexts: ["selection"]`, title `Analyse "%s" in NetCarve` — and does
  nothing else: no network, no storage, no other listeners (FR-CTX-01).
- Clicking it runs `findIpTokens` over the selection and opens the app at
  `#/calc?q=<token>` for the first valid address or block; when the selection holds none, the
  raw text is passed through truncated to 128 characters so the user sees the friendly parse
  error rather than nothing happening (FR-CTX-02/03).
- The integration lives in `src/lib/menu.ts` behind a small API interface, so it is tested
  against a fake `chrome` rather than needing a browser.

### Tests
- 10 cases: token extraction from punctuation-wrapped and prose selections, the address-and-mask
  form, the truncating fallback, an absent selection, single-item registration after clearing
  any previous one, tab opening with the right URL, and clicks on other menu items ignored.

## [0.12.0] — 2026-08-19

### Added
- The **conflict checker** (F5) at `#/conflicts`: paste one entry per line — CIDR, bare
  address or `addr mask` — with blank lines and `#` comments ignored, and unreadable lines
  reported by number without aborting the run (FR-CONF-01).
- Findings are grouped into identical blocks (with the lines they appeared on) and containment
  chains rendered outermost first, e.g. `10.0.0.0/8 ⊃ 10.1.0.0/16 ⊃ 10.1.2.0/24`, with the
  report stating explicitly that aligned CIDR blocks cannot partially overlap (FR-CONF-03).
- A positive "no overlaps found across N blocks" state (FR-CONF-04), IPv4 and IPv6 compared
  independently (FR-CONF-02), and Markdown export of the whole report (FR-CONF-06).
- The analysis is a sort plus a single stack sweep rather than a pairwise scan (FR-CONF-05).

### Tests
- 29 further cases: parsing, comments, rebasing to the network address, per-line error
  reporting, chain construction, cross-family independence, and the UI. Correctness is checked
  against a brute-force O(n²) oracle over eight seeded random inputs, and two performance tests
  confirm 1,000 lines complete well inside the one-second budget.

## [0.11.0] — 2026-08-19

### Added
- The **VLSM solver view** at `#/vlsm` (F4): a base network, a reorderable list of
  requirements with add and remove, and an allocation that recomputes as you type — no Solve
  button needed. The results table shows name, allocated block, mask, range, usable and waste
  in address order, followed by the leftover free blocks and a utilisation summary
  (FR-VLSM-01/04).
- A shortfall banner naming the requirement that did not fit and by how many addresses, with
  everything allocated before it still on screen (FR-VLSM-05).
- **Send to planner** (FR-VLSM-06): the allocation is rebuilt as a planner tree — splitting
  only where an allocation actually sits, so the planner's structural invariant holds — and
  becomes either a new project or a new root inside a chosen existing one, then opens it.
- Markdown and CSV export of a solution (FR-VLSM-07), including the free-block list and the
  shortfall note.
- The `/31` toggle from Settings feeds straight into the solver, with a hint on the page when
  it is on.

### Tests
- 9 further cases: the §7 acceptance vector rendered cell by cell, the shortfall message, the
  IPv6-base refusal, requirement reordering and removal, the Markdown export, sending to a new
  project, adding to an existing one, and the tree the converter produces.

## [0.10.0] — 2026-08-19

### Added
- `src/lib/vlsm/solver.ts`: the VLSM solver (F4), reproducing FR-VLSM-03 exactly — requirements
  sorted by block size descending and stable by input order, a free list seeded with the base
  network, and each requirement taking the lowest-addressed free block that fits, split
  minimally until a block of the right size falls out.
- Sizing per FR-VLSM-02 (`hosts + 2`, rounded up to a power of two), with the "allow /31 for
  two-host links" option sizing one- and two-host requirements as a /31.
- Shortfall reporting (FR-VLSM-05): the requirement that failed is named with how many more
  addresses would have been needed, and everything allocated before it is still returned.
- Leftover blocks are merged back into the largest whole blocks, so the free list reads as
  what is actually available rather than the fragments splitting happened to leave.

### Fixed
- `formatPercent` rounds to nearest instead of truncating, so the §7 vector reports 93.8 %
  utilisation rather than 93.7 %.

### Tests
- 33 cases, including the canonical §7 acceptance vector down to each block, usable count and
  waste figure; independence from input ordering; tie-breaks; the exact-fit and empty cases;
  the /31 toggle end to end; three shortfall paths; and every input-validation refusal.

## [0.9.0] — 2026-08-19

### Added
- **Markdown export** for a whole project: the project name and client as a heading, then one
  table per root block with exactly the specified columns `Subnet | Mask | Range | Usable |
  Name | VLAN | Notes`, IPv6 rows leaving Mask blank, pipes inside cells escaped, and the
  `Generated by NetCarve — attv.uk` footer that Settings can switch off (FR-EXP-01).
- **CSV export** with RFC 4180 quoting, CRLF line endings and plain-digit counts, delivered
  through an object-URL anchor so no extra permission is needed (FR-EXP-02). A `Root` column
  appears when a project holds more than one root block.
- **JSON export and import** in the documented `{ app, schemaVersion, project }` envelope,
  plus an export-all form carrying every project. Import revalidates every node, quarantines a
  broken root, and refuses a schema version this build cannot read (FR-EXP-03).
- The planner header carries Copy-as-Markdown, Download CSV and Download JSON; the projects
  page carries Import JSON and Export all projects; Settings' "Export all data" writes the
  same file (FR-STOR-03).

### Tests
- 29 further cases: the exact column set and row contents, IPv6 masks left blank, RFC 4180
  quoting of commas, quotes and newlines, the multi-root CSV header, JSON round-trips for one
  project and for an export-all, five rejection paths, schema-version refusal, quarantine on
  import, and the UI wiring for copy, download and import.

## [0.8.0] — 2026-08-19

### Added
- The **Planner** (F3): an indented, keyboard-operable tree per root block. Every leaf row
  carries a colour dot, the block, the dotted mask (IPv4), the address range, the usable
  count, the name and the VLAN; internal nodes carry a name, a collapse twisty and a join
  action (FR-PLAN-06).
- Split, Split-to-a-target-prefix and Join, with the join confirmation naming how many named
  subnets would be lost, and the 1,024-leaf refusal explained rather than silent
  (FR-PLAN-03/04).
- Inline metadata editing with a **colour swatch grid** — never a text field — plus a VLAN
  field validated against 1–4094 and a notes field (FR-PLAN-05).
- A utilisation meter per root showing how much of the block is covered by named subnets
  (FR-PLAN-07), a saved-state indicator with debounced autosave (FR-PLAN-08), and undo/redo
  buttons over the whole plan (FR-PLAN-09).
- IPv6 roots behave identically, and a /64 leaf carries the standard-subnet badge
  (FR-PLAN-10).
- Keyboard: arrow keys move and collapse/expand, `S` splits, `J` joins, `F2`/`Enter` edits,
  with ARIA tree roles throughout (§9.4).
- The **Projects** view (FR-PLAN-01): create with name/client/notes, cards showing root and
  subnet counts and the last update, open, and delete behind a confirmation.
- `useProjects` owns the list and its debounced persistence; a root that fails validation on
  load is quarantined and reported in a toast instead of vanishing quietly.
- `describeBlock` gives the planner, the solver and the exporters one shared summary.

### Fixed
- The planner now tells its parent about a new plan from an effect rather than from inside a
  state updater, and is mounted with `key={project.id}` so switching projects gives a fresh
  undo history. Previously a split could be discarded before it rendered.

### Tests
- 13 component tests walking the whole §6 acceptance flow: add a root, refuse an overlapping
  one, split to two /17s and on to /18s, name a leaf with a VLAN and a colour, join with the
  confirmation naming one affected subnet, undo and redo, the /27 refusal and the /24 carve,
  the utilisation meter, the IPv6 /64 badge, collapse/expand, keyboard operation and autosave.

## [0.7.0] — 2026-08-19

### Added
- `src/lib/plan/projects.ts`: load and save every project through `chrome.storage.local`,
  find/upsert/remove, `touch` for `updatedAt`, and root management. `addRoot` stores the
  canonical network form and **refuses a root that overlaps an existing one** in the same
  project, decided with `relationOf`, so an identical block and a containing block are both
  caught (FR-PLAN-02). Loading skips unusable entries and reports quarantined roots per
  project rather than failing.
- `src/lib/plan/history.ts`: the undo/redo stack (FR-PLAN-09) — `pushHistory`, `undo`,
  `redo`, `canUndo`, `canRedo` and `replaceHistory` for in-progress typing. Bounded at 50
  steps, comfortably above the required 20.

### Tests
- 17 further cases: canonical root storage, overlap refusal for identical/inner/outer blocks,
  cross-family roots living happily side by side, list ordering by most recent update, a
  storage round-trip, quarantine reporting, and the full undo/redo behaviour including the
  redo stack being dropped and the bound being honoured.

## [0.6.0] — 2026-08-19

### Added
- `src/lib/plan/model.ts`: the `Project` and `PlanNode` types from spec §9.5, the eight
  palette tokens, `createProject`, and the validation that enforces the structural invariant —
  a node's children are exactly `splitOnce(node.cidr)`. Loading re-validates every node,
  repairs metadata that no longer makes sense (an unknown colour, a VLAN outside 1–4094) and
  **quarantines a corrupt root** with a readable reason instead of crashing the app.
- `src/lib/plan/tree.ts`: pure tree operations addressed by path — `splitNode`, `joinNode`,
  `splitToPrefix`, `updateNode`, `nodeAt`, `flattenTree` (address order, collapsible),
  `leavesOf`, `countLeaves`, `countNamedLeaves` and `utilisation`. Every operation returns a
  new tree, which is what makes undo a matter of keeping the previous root.
- `src/lib/plan/limits.ts`: the 1,024-leaf ceiling per root (FR-PLAN-04) and the VLAN bounds.
  `splitToPrefix` refuses the whole operation rather than partly applying it, and computes the
  resulting leaf count without building the tree first — so an IPv6 /32 → /96 carve is
  declined instantly.

### Tests
- 50 cases: splitting and joining in both families, the §6 walkthrough shapes, the limit
  boundary (a /16 carved to /26 is exactly 1,024 leaves and allowed; to /27 is refused),
  metadata set and clear, structural sharing on update, utilisation including IPv6, every
  invariant rejection, and project quarantine on load.

## [0.5.0] — 2026-08-19

### Added
- The full-page app shell: hash router (`#/calc`, `#/projects`, `#/planner/:projectId`,
  `#/vlsm`, `#/conflicts`, `#/settings`), wordmark, nav rail and the attv.uk credit footer on
  every route.
- `consumeQueryParam` reads `?q` once and rewrites the URL through `history.replaceState`, so
  a refresh does not re-run a context-menu analysis (FR-CTX-04). The calculator route picks
  the value up, including an unparsable selection, which shows the friendly error (FR-CTX-03).
- The Settings view: theme (auto/light/dark, applied immediately and persisted), the /31
  toggle, the export-footer toggle, the default copy format, the planner limit shown read-only
  (DECISIONS D4), an About block, and Delete-all-data behind a typed `DELETE` confirmation
  (FR-STOR-03).
- A non-blocking `Toast` component for storage failures and export confirmations.

### Tests
- 28 further cases: the full route table, query parsing and one-shot consumption, navigation,
  theme application and persistence, settings toggles, and the typed delete confirmation.

## [0.4.0] — 2026-08-19

### Added
- The Quick Calculator (F1) as a single Preact view shared by the popup and, from the next
  release, the `#/calc` route: debounced parsing at 150 ms, inline error copy, the IPv4 and
  IPv6 field sets, reserved-range badges with a deprecated flag, the §4.4 notes, click-to-copy
  on every value and a Copy-as-Markdown action (FR-CALC-01…06).
- The **bit ruler** component — 32 cells for IPv4 grouped into octets, eight 16-bit groups for
  IPv6 with the boundary group filled proportionally, and a hard rule at the prefix boundary.
- The toolbar popup: restores the last input from `netcarve:calcLast` and carries the current
  input into the full app (FR-CALC-07/08).
- `src/styles/app.css` with the shared component styles, `src/ui/theme.ts` (theme application
  and a settings hook), `src/ui/hooks.ts`, `src/ui/appUrl.ts`, the `AppFooter` credit line and
  `src/lib/export/download.ts` (clipboard writes and object-URL downloads, no extra
  permissions).
- The package version is injected at build time and shown in the popup header.

### Tests
- 12 component tests with `@testing-library/preact`: the IPv4 and IPv6 result sets, ruler
  structure, error appearing and clearing, the prefix stepper, clipboard copies of a single
  value and of the whole Markdown table, and popup restore/open-app behaviour.

## [0.3.0] — 2026-08-19

### Added
- `src/lib/format.ts`: `formatCount` shows an exact grouped decimal up to 2⁵³ and switches to
  a power of two with a scientific approximation beyond it (spec §4.4), keeping the exact
  digits for click-to-copy. Also `groupDigits`, `superscript`, `scientific`, `formatPercent`
  and `formatDate`.
- `src/lib/calc/result.ts`: `buildCalcResult` turns an input string into the whole calculator
  view-model — labelled fields, the bit ruler (32 bits for IPv4, 8 groups for IPv6 with a
  partially filled boundary cell), the §4.4 notes, parser warnings and reserved-range
  findings. `withPrefix` re-runs it at a different prefix for the in-place stepper
  (FR-CALC-06). IPv6 results never expose a broadcast field.
- `src/lib/export/markdown.ts`: `calcToMarkdown` plus the shared `markdownTable`,
  `escapeCell` and `withFooter` helpers, with the `Generated by NetCarve — attv.uk` line
  switchable (FR-EXP-01).

### Tests
- 31 cases: the IPv4 and IPv6 field sets, every §4.4 edge case surfacing as a note, the bit
  ruler contents and boundary, all five §5 acceptance inputs, prefix clamping, and the
  Markdown output including reserved ranges and the deprecated marker.

## [0.2.0] — 2026-08-19

### Added
- `src/styles/tokens.css`: the full design-token system. NetCarve's visual language is a
  drafting sheet rather than a dashboard — cool paper, petrol ink, hairline rules and
  wide-tracked uppercase micro-labels, with the **bit ruler** (a strip of cells with a hard
  rule at the prefix boundary) as the signature element carried across every view. Dark mode
  follows `prefers-color-scheme` and is overridden by `data-theme` from Settings.
- The eight planner palette tokens, each defined as a tint, a text colour that keeps at least
  4.5:1 against it, and a solid dot for the tree gutter — in both themes (§9.4, NFR-A11Y-01).
- `src/strings.ts`: every user-facing string in British English, plus `errorMessage` and
  `warningMessage` mapping parser codes to friendly copy (NFR-I18N-01).
- `src/lib/storage/store.ts`: typed `chrome.storage.local` wrapper with a 500 ms debounced
  writer, an in-memory fallback when `chrome` is absent, and quota failures reported through
  a callback instead of thrown (FR-STOR-01/02).
- `src/lib/storage/settings.ts`: `Settings` defaults, normalisation of anything unrecognised
  in storage, and load/save.

### Tests
- 18 cases: the memory and `chrome.storage.local` areas, read/write/remove failure paths,
  debounce coalescing under fake timers, flush semantics, quota-failure reporting, and
  settings normalisation of null, junk and out-of-range values.

## [0.1.0] — 2026-08-19

### Added
- `src/lib/ip/special.ts`: both special-range tables from spec §4.3 in full (16 IPv4 rows,
  16 IPv6 rows, each with a label, a one-line note and a `deprecated` flag where it applies)
  plus `lookupSpecial`, which returns **every** range covering the input's network address,
  most specific first (FR-INTEL-01/02).
- `src/lib/ip/index.ts`: the public barrel for the domain library.
- `.github/workflows/ci.yml`: type check, tests with coverage, and a production build on
  every push and pull request.

### Changed
- The IP domain library now holds **100 % statement, branch, function and line coverage**,
  and `vitest.config.ts` fails the run below that (NFR-QUAL-01). This completes milestone M1's
  library half: 283 tests across `errors`, `v4`, `v6`, `cidr`, `math`, `tokens` and `special`.

## [0.0.6] — 2026-08-19

### Added
- `src/lib/ip/tokens.ts`: `findIpTokens(text)` scans free text for IPv4/IPv6/CIDR tokens and
  returns each one with its source offset and parsed block — the input side of the context
  menu (F6).
- Regular expressions only produce candidates; every candidate is validated through
  `parseCidr`, so MAC addresses, timestamps, version strings and out-of-range octets are
  discarded. A candidate whose suffix fails is retried as a bare address, so
  `10.0.0.1 10.0.0.2` yields both addresses rather than nothing.

### Tests
- 24 cases: punctuation-wrapped tokens, sentence-ending prefixes (`192.168.10.0/24.`),
  `[2001:db8::1]:443`, zone IDs, IPv4-mapped IPv6, address-and-mask pairs, multi-line
  selections, and ten near-misses that must find nothing (`999.1.1.1`, `1.2.3.4000`,
  `v1.2.3.4-beta`, `00:1a:2b:3c:4d:5e`, `10:30:45`, `16:9`, …).

## [0.0.5] — 2026-08-19

### Added
- `src/lib/ip/math.ts`: `networkOf`, `networkAddressOf`, `lastAddressOf`, `broadcastOf`,
  `totalAddresses`, `usableRange`, `contains`, `relationOf`, `splitOnce`, `compareCidr` and
  `prefixForSize`.
- `usableRange` implements spec §4.4 exactly: an IPv4 `/31` is an RFC 3021 point-to-point
  link with both addresses usable, a `/32` is a host route, `/30` and shorter reserve the
  network and broadcast addresses, and every IPv6 address counts as usable.
- The alignment invariant — aligned CIDR blocks cannot partially overlap — is documented at
  the top of the module, which is what lets `relationOf` answer with only four cases.
- `formatAddressValue` in `cidr.ts` renders a raw address value for a given family.

### Tests
- 63 vectors covering every §4.4 edge case in both families, containment and relation
  tables, splitting from `/0` down to the refusal at `/32` and `/128`, and sort ordering.

## [0.0.4] — 2026-08-19

### Added
- `src/lib/ip/cidr.ts`: the `Cidr` value type (a discriminated union on `family`, so IPv4
  narrows to `number` and IPv6 to `bigint`), plus `parseCidr`, `formatCidr`,
  `formatAddress`, `makeCidr` and `bitsOf`.
- `parseCidr` accepts `addr`, `addr/prefix`, and — for IPv4 — both `addr mask` and
  `addr/mask` with a contiguous dotted mask. A bare address becomes `/32` or `/128` with an
  `ASSUMED_HOST_PREFIX` warning, and an address carrying bits below the prefix boundary is
  accepted with a `HOST_BITS_SET` warning (spec §4.4: never an error).

### Tests
- 33 vectors: both families, both mask spellings, warning propagation from the IPv6 zone-ID
  parser, the /0 and /32 extremes, and every rejection code (`BAD_PREFIX`, `BAD_FORM`,
  `MASK_NOT_SUPPORTED`, `NONCONTIGUOUS_MASK` and the underlying address errors).

## [0.0.3] — 2026-08-19

### Added
- `src/lib/ip/v6.ts`: `parseIPv6`, `formatIPv6`, `expandIPv6`, `maskV6` and `MAX128`.
- RFC 4291 parsing — a single `::` compression, an embedded IPv4 tail (`::ffff:192.0.2.1`),
  case-insensitive input, and a zone ID (`%eth0`) that is stripped and reported as a
  warning rather than an error.
- RFC 5952 §4 canonical formatting — lowercase hex, no leading zeros inside a group, and the
  longest run of two or more zero groups compressed to `::`, leftmost run winning a tie.
  A lone zero group is never compressed.

### Tests
- 60 vectors including `2001:db8:0:0:1::1` → `2001:db8::1:0:0:1`, the tie-break and
  single-zero-group rules, and every rejection path (`DOUBLE_COMPRESSION`, `BAD_GROUP`,
  `TOO_MANY_GROUPS`, `TOO_FEW_GROUPS`, misplaced IPv4 tail, empty zone ID).

## [0.0.2] — 2026-08-19

### Added
- `src/lib/ip/errors.ts`: `ParseResult` discriminated union, `ParseError` codes, `Warning`
  codes and the `isParseError` guard — nothing in the IP library throws.
- `src/lib/ip/v4.ts`: `parseIPv4`, `formatIPv4`, `maskV4`, `wildcardV4`, `parseV4Mask`,
  with strict rejection of leading zeros, shorthand and whitespace padding.

## [0.0.1] — 2026-08-19

### Added
- Initial project scaffold: WXT (Manifest V3) + Preact + TypeScript in strict mode.
- Vitest with jsdom and a 100 % branch-coverage threshold scoped to `src/lib/ip/**` (NFR-QUAL-01).
- Manifest requesting exactly `storage` and `contextMenus` (NFR-PERM-01).
- Extension icons at 16/32/48/96/128 px.
- The product specification (`docs/spec.md`), implementation plan and `DECISIONS.md`.

[Unreleased]: https://github.com/AmigoUK/Netcarve/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/AmigoUK/Netcarve/releases/tag/v1.2.0
[1.1.2]: https://github.com/AmigoUK/Netcarve/releases/tag/v1.1.2
[1.1.1]: https://github.com/AmigoUK/Netcarve/releases/tag/v1.1.1
[1.1.0]: https://github.com/AmigoUK/Netcarve/releases/tag/v1.1.0
[1.0.2]: https://github.com/AmigoUK/Netcarve/releases/tag/v1.0.2
[1.0.1]: https://github.com/AmigoUK/Netcarve/releases/tag/v1.0.1
[1.0.0]: https://github.com/AmigoUK/Netcarve/releases/tag/v1.0.0
[0.13.0]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.13.0
[0.12.0]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.12.0
[0.11.0]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.11.0
[0.10.0]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.10.0
[0.9.0]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.9.0
[0.8.0]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.8.0
[0.7.0]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.7.0
[0.6.0]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.6.0
[0.5.0]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.5.0
[0.4.0]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.4.0
[0.3.0]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.3.0
[0.2.0]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.2.0
[0.1.0]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.1.0
[0.0.6]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.0.6
[0.0.5]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.0.5
[0.0.4]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.0.4
[0.0.3]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.0.3
[0.0.2]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.0.2
[0.0.1]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.0.1
