# NetCarve — Product Specification

**Chrome extension: IP subnet calculator, visual address planner and VLSM solver**

| Field | Value |
|---|---|
| Working title | NetCarve (alternative: PrefixLens — see Open Questions) |
| Codename / repo | `AmigoUK/netcarve` |
| Version of this document | 1.0 |
| Status | Ready for implementation |
| Audience | Coding agent / implementing developer |
| Language of deliverable | UI copy and store listing in British English |
| Publisher | attv.uk |

This document is the single source of truth for the MVP and v1.0 scope. Requirements carry stable IDs (e.g. `FR-CALC-03`) so they can be referenced in commits, issues and tests. Anything not listed under a milestone in §12 is out of scope until explicitly scheduled.

---

## 1. Product overview

### 1.1 Problem

Subnet calculators are plentiful, but nearly all of them answer only "what is this subnet?" — you enter a CIDR, you get the mask, broadcast and host range. Almost none of them solve the consultant's actual job: **planning an address space for a client, keeping that plan, and exporting it into documentation**. The best-known visual planner (davidc.net's Visual Subnet Calculator) has no persistence, no projects and no IPv6.

### 1.2 Target users

1. IT consultants and MSP engineers planning client networks (primary persona — matches attv.uk clientele).
2. Network and infrastructure engineers documenting VLAN/subnet layouts.
3. Students and certification candidates (CCNA-level) practising subnetting and VLSM.

### 1.3 Positioning

Free, local-first Chrome extension published under the attv.uk brand as a marketing asset, in the same family as LtdLens, StyleGrab and UsrHelper. Tagline direction: *"Plan address space, not just calculate it."* All computation happens in the browser; no data ever leaves the machine.

### 1.4 Why an extension rather than a website

- **Context-menu analysis**: select any IP/CIDR on any page (documentation, a config on GitHub, a support ticket) → right-click → instant analysis.
- **Persistent projects** in `chrome.storage.local`, available offline, one click from the toolbar.
- Store presence generates discoverability and installs without hosting costs.

---

## 2. Goals and non-goals

### 2.1 Goals

- G1: Fastest possible answer to "what is this subnet?" for IPv4 **and** IPv6.
- G2: A visual, persistent subnet planner with named, colour-coded blocks organised into projects.
- G3: A VLSM solver that turns host-count requirements into an optimal allocation.
- G4: Overlap/conflict detection across pasted CIDR lists.
- G5: One-click export to Markdown and CSV suitable for client documentation.
- G6: Zero backend, zero telemetry, minimal permissions.

### 2.2 Non-goals (for v1.0)

- NG1: No live network probing, ping, DNS, whois or RIPE/ARIN look-ups (would require host permissions and network access; conflicts with the local-first promise).
- NG2: No IPAM synchronisation (NetBox export is a future item, §13).
- NG3: No account system, cloud sync or team sharing.
- NG4: No route summarisation/aggregation tool in v1.0 (future item).
- NG5: No Firefox/Edge store submissions in v1.0 (WXT keeps the door open).

---

## 3. Technical foundation

### 3.1 Stack

Identical to the rest of the AmigoUK extension family:

- **WXT** (latest stable) as the extension framework, Manifest V3.
- **TypeScript** in `strict` mode. No `any` in `src/lib/**`.
- **Preact** with hooks for all UI.
- **Vitest** for unit tests.
- Styling: plain CSS with custom properties (design tokens), `prefers-color-scheme` for dark mode. No CSS framework, no runtime styling library.
- **Zero runtime dependencies for IP mathematics.** All parsing, arithmetic and formatting is hand-written in `src/lib/ip/` using `number` (unsigned 32-bit semantics) for IPv4 and native `BigInt` for IPv6. Rationale: bundle size, auditability, and full control over edge cases.

### 3.2 Entrypoints

| Entrypoint | Purpose |
|---|---|
| `entrypoints/popup/` | Quick Calculator (F1/F2). Compact, ~400 px wide. Link to open the full app. |
| `entrypoints/app/` | Full-page extension tab hosting Planner (F3), VLSM (F4), Conflict Checker (F5), projects and settings. Hash routing (`#/calc`, `#/planner/:projectId`, `#/vlsm`, `#/conflicts`, `#/settings`). |
| `entrypoints/background.ts` | Service worker: context-menu registration and click handling only. |

No content scripts. Selected text reaches the background worker via `contextMenus` (`info.selectionText`), so none are needed.

### 3.3 Permissions (manifest)

```json
"permissions": ["storage", "contextMenus"]
```

Nothing else. No host permissions, no `activeTab`, no `clipboardWrite` (clipboard writes use `navigator.clipboard.writeText` from extension pages under a user gesture, which requires no permission). This keeps Web Store review trivial and supports the privacy pitch.

- NFR-PERM-01: The manifest MUST NOT request any permission beyond `storage` and `contextMenus`.
- NFR-PERM-02: The extension MUST make no network requests at runtime. CSP should not include any remote `connect-src`.

---

## 4. Domain library (`src/lib/ip/`)

Pure, framework-free TypeScript. This module is the heart of the product and MUST reach 100 % branch coverage in Vitest (§11).

### 4.1 Internal representations

- IPv4 address: `number`, always handled with unsigned semantics (`>>> 0` after bitwise ops).
- IPv6 address: `bigint` in the range `0n … 2n**128n - 1n`.
- A parsed value is represented as a discriminated union:

```ts
type IpFamily = 4 | 6;

interface Cidr {
  family: IpFamily;
  /** Address exactly as entered (post-normalisation of case), not necessarily the network address. */
  address: number | bigint;
  prefix: number; // 0–32 (v4), 0–128 (v6)
}
```

### 4.2 Required functions (signatures indicative)

| Function | Contract |
|---|---|
| `parseIPv4(s): number \| ParseError` | Strict dotted-quad. Four decimal octets 0–255. Reject leading zeros (`010` is an error — avoids octal ambiguity), reject shorthand (`10.1`), reject whitespace padding. |
| `parseIPv6(s): bigint \| ParseError` | Full RFC 4291 forms: `::` compression (at most once), embedded IPv4 tail (`::ffff:192.0.2.1`), case-insensitive. A zone ID suffix (`%eth0`) is stripped and reported via a `warnings` field, not an error. |
| `parseCidr(s): Cidr \| ParseError` | Accepts `addr`, `addr/prefix`, and for IPv4 also `addr mask` (dotted mask, e.g. `10.0.0.0 255.255.255.0`; the mask must be contiguous). Bare address ⇒ `/32` or `/128` with a `warnings` entry noting the assumption. |
| `maskV4(prefix): number` | `prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0`. |
| `maskV6(prefix): bigint` | `prefix === 0n ? 0n : (MAX128 >> BigInt(128 - prefix)) << BigInt(128 - prefix)` where `MAX128 = 2n**128n - 1n`. |
| `networkOf(cidr): Cidr` | `address & mask`. |
| `lastAddressOf(cidr)` | `network \| ~mask` (v4: also exposed as `broadcast`; v6: labelled "last address" — IPv6 has no broadcast and the UI must never call it one). |
| `usableRange(cidr)` | See §4.4 edge cases. |
| `totalAddresses(cidr): bigint` | `2^(bits - prefix)` as `bigint` for both families. |
| `formatIPv4(n): string` | Dotted quad. |
| `formatIPv6(v): string` | RFC 5952 canonical form: lowercase hex, longest zero run (leftmost on tie, runs of length ≥ 2) compressed to `::`, no leading zeros within groups. |
| `contains(a: Cidr, b: Cidr): boolean` | True iff `a` and `b` are the same family and `b`'s range lies within `a`'s. |
| `relationOf(a, b): 'identical' \| 'a-contains-b' \| 'b-contains-a' \| 'disjoint'` | Because CIDR blocks are aligned, partial overlap is impossible; the implementation may rely on this and MUST document it. |
| `splitOnce(cidr): [Cidr, Cidr]` | The two child blocks at `prefix + 1`. Error if already at max prefix. |
| `findIpTokens(text): FoundToken[]` | Scans free text for IPv4/IPv6/CIDR tokens (used by the context menu, F6). Must find the first valid token even when surrounded by punctuation, and must validate candidates through the real parsers rather than trusting the regex alone. |

`ParseError` carries a machine code (`'BAD_OCTET'`, `'BAD_PREFIX'`, `'DOUBLE_COMPRESSION'`, `'NONCONTIGUOUS_MASK'`, …) plus a human message; the UI maps codes to friendly copy.

### 4.3 Special-range intelligence (data tables)

Two constant tables, checked by longest-prefix match against the *network address* of the input. Each entry: `cidr`, `label`, `shortNote`, optional `deprecated: true`.

IPv4 table (complete list for v1.0):

| CIDR | Label |
|---|---|
| 0.0.0.0/8 | "This network" (RFC 791) |
| 10.0.0.0/8 | Private (RFC 1918) |
| 100.64.0.0/10 | Shared address space / CGNAT (RFC 6598) |
| 127.0.0.0/8 | Loopback |
| 169.254.0.0/16 | Link-local / APIPA (RFC 3927) |
| 172.16.0.0/12 | Private (RFC 1918) |
| 192.0.0.0/24 | IETF protocol assignments |
| 192.0.2.0/24 | Documentation TEST-NET-1 |
| 192.88.99.0/24 | 6to4 relay anycast — deprecated (RFC 7526) |
| 192.168.0.0/16 | Private (RFC 1918) |
| 198.18.0.0/15 | Benchmarking (RFC 2544) |
| 198.51.100.0/24 | Documentation TEST-NET-2 |
| 203.0.113.0/24 | Documentation TEST-NET-3 |
| 224.0.0.0/4 | Multicast |
| 240.0.0.0/4 | Reserved (former Class E) |
| 255.255.255.255/32 | Limited broadcast |

IPv6 table:

| CIDR | Label |
|---|---|
| ::/128 | Unspecified |
| ::1/128 | Loopback |
| ::ffff:0:0/96 | IPv4-mapped |
| 64:ff9b::/96 | NAT64 well-known prefix (RFC 6052) |
| 64:ff9b:1::/48 | Local-use NAT64 (RFC 8215) |
| 100::/64 | Discard-only (RFC 6666) |
| 2000::/3 | Global unicast |
| 2001::/32 | Teredo |
| 2001:db8::/32 | Documentation |
| 3fff::/20 | Documentation (RFC 9637) |
| 2002::/16 | 6to4 — deprecated |
| 5f00::/16 | SRv6 SIDs (RFC 9602) |
| fc00::/7 | Unique local (ULA) |
| fe80::/10 | Link-local |
| fec0::/10 | Site-local — deprecated |
| ff00::/8 | Multicast |

- FR-INTEL-01: For any valid input, all matching entries are shown (e.g. `10.1.2.3` matches Private RFC 1918; `2002:...` shows the deprecation flag), most-specific first.
- FR-INTEL-02: Deprecated ranges render with a visible "deprecated" badge.

### 4.4 Edge cases (normative)

| Case | Required behaviour |
|---|---|
| IPv4 `/31` | 2 usable addresses (point-to-point, RFC 3021). UI shows a note "RFC 3021 point-to-point". No broadcast/network reservation. |
| IPv4 `/32` | 1 address; first = last = the address; label "host route". |
| IPv4 prefix ≤ 30 | usable = total − 2; first = network + 1; last = broadcast − 1. |
| IPv4 `/0` | Valid; totals shown; usable-host arithmetic still applies. |
| IPv6 `/127` | Point-to-point (RFC 6164) note; 2 addresses. |
| IPv6 `/128` | Host route; 1 address. |
| IPv6 generally | No broadcast concept; "usable" equals total (subnet-router anycast may be mentioned in a footnote, not subtracted). Totals > 2⁵³ are displayed as a power of two (e.g. `2⁶⁴`) with an approximate decimal in scientific notation alongside. |
| IPv6 `/64` | Badge: "standard subnet size". |
| Input is not the network address (e.g. `192.168.1.37/24`) | Never an error. Show the derived network and a subtle note "input was a host address within this network". |

---

## 5. F1 — Quick Calculator (popup and `#/calc`)

- FR-CALC-01: A single input accepts anything `parseCidr` accepts, both families, with parsing on every keystroke (debounced ≤ 150 ms) and inline error copy on failure.
- FR-CALC-02: For valid IPv4 input, display: network address, prefix, dotted mask, wildcard mask, broadcast, first/last usable, usable count, total count, and the binary breakdown of the address with the network/host boundary visually marked.
- FR-CALC-03: For valid IPv6 input, display: canonical RFC 5952 form, full uncompressed form, network address, prefix, last address, total count (per §4.4), and the hex-group breakdown with the boundary marked.
- FR-CALC-04: Special-range findings (§4.3) render as badges directly under the result.
- FR-CALC-05: Every displayed value has a click-to-copy affordance; a "Copy as Markdown" button copies the whole result as a Markdown table (same interaction pattern as UsrHelper's "Copy as Markdown").
- FR-CALC-06: A prefix slider/stepper lets the user change the prefix of the current result in place and watch values update live.
- FR-CALC-07: The popup keeps the last input in `storage.local` and restores it on reopen.
- FR-CALC-08: "Open full app" link opens `#/calc` with the current input carried over.

Acceptance: entering `192.168.1.37/24`, `10.0.0.0 255.255.255.0`, `2001:db8::1/48`, `::ffff:10.0.0.1` and `fe80::1%eth0` each produces a correct, non-erroring result consistent with §4.

---

## 6. F3 — Planner (killer feature, `#/planner/:projectId`)

### 6.1 Concept

A project holds one or more **root blocks** (e.g. `10.20.0.0/16`). Each block is a binary tree: any node can be split into its two `prefix + 1` children or joined back. Leaves are the actual planned subnets and carry metadata (name, colour, VLAN ID, notes). Derived values (mask, range, usable) are always computed, never stored.

### 6.2 Requirements

- FR-PLAN-01: Create/rename/delete projects; each project has `name`, optional `client`, optional `notes`, timestamps.
- FR-PLAN-02: Add a root block to a project by entering a CIDR (both families allowed; family is per-block). Reject a new root that overlaps an existing root in the same project (use `relationOf`).
- FR-PLAN-03: Split a leaf into two children (one click). Join collapses a node's entire subtree after a confirmation that lists how many named descendants will be lost.
- FR-PLAN-04: "Split to target prefix" dialogue: choose a target prefix (e.g. carve a /16 straight into /24s); the tree recurses automatically. HARD LIMIT: any operation that would result in more than 1 024 leaves in a single root is refused with an explanatory message (protects UI performance and storage size).
- FR-PLAN-05: Leaf metadata: editable inline — `name` (free text), `vlanId` (integer 1–4094, optional), `colour` (one of the 8 palette tokens, §9.4), `notes` (free text). Internal nodes may carry a name only.
- FR-PLAN-06: Rendering: an indented tree in address order. Each leaf row shows: colour dot, CIDR, dotted mask (v4), address range, usable count, name, VLAN, split button. Internal nodes show CIDR + name + join button and are collapsible.
- FR-PLAN-07: A utilisation summary bar per root: percentage of the root's address space covered by *named* leaves vs unnamed (free) leaves.
- FR-PLAN-08: All edits autosave to `storage.local`, debounced 500 ms; a saved-state indicator is visible.
- FR-PLAN-09: Undo/redo (in-memory, per session, ≥ 20 steps) for split/join/metadata edits.
- FR-PLAN-10: IPv6 blocks behave identically; usable counts follow §4.4 and a `/64` leaf shows the standard-subnet badge.

Acceptance: recreate this plan in under a minute — root `10.20.0.0/16`; split to /24s is refused politely (would exceed limit? 256 leaves — allowed); split once to two /17s; split the first /17 into /18s; name `10.20.0.0/18` "VLAN 10 — Office", colour blue, VLAN 10; join back to the /16 with the confirmation naming 1 affected leaf; undo restores everything.

*(Note for the agent: /16 → /24 yields 256 leaves, within the 1 024 limit; the refusal path must instead be tested with e.g. /16 → /27.)*

---

## 7. F4 — VLSM Solver (`#/vlsm`)

- FR-VLSM-01: Inputs: one base network (v4 in v1.0; v6 solver is a future item since host-count-driven sizing is an IPv4 problem) and a list of requirements `{ name, requiredHosts }` with add/remove/reorder.
- FR-VLSM-02: Sizing: `needed = requiredHosts + 2`; block size = next power of two ≥ needed; prefix = 32 − log₂(size). A settings toggle "allow /31 for 2-host links" (default **off**) sizes 2-host requirements as /31 instead of /30 when enabled.
- FR-VLSM-03: Allocation algorithm (deterministic, must be reproduced exactly): sort requirements by block size descending, stable by input order; maintain a free-block list initialised with the base network; for each requirement take the lowest-addressed free block that fits, splitting it minimally until an exact-size block is produced; assign it; return remaining free blocks.
- FR-VLSM-04: Output table in address order: name, allocated CIDR, mask, range, usable, waste (usable − required). Below it: leftover free blocks. A summary line gives total utilisation.
- FR-VLSM-05: If the base cannot fit all requirements, the result names the first requirement that failed and the shortfall in addresses; earlier allocations are still shown.
- FR-VLSM-06: "Send to Planner": one click converts a successful solution into a new project (or a new root in an existing project) with named leaves.
- FR-VLSM-07: Export buttons as per F7.

Acceptance (canonical test vector, must be covered by a unit test): base `192.168.10.0/24`, requirements Warehouse 120, Office 50, VoIP 20, Management 10 →
`Warehouse 192.168.10.0/25` (126 usable), `Office 192.168.10.128/26` (62), `VoIP 192.168.10.192/27` (30), `Management 192.168.10.224/28` (14), free `192.168.10.240/28`.

---

## 8. F5 — Conflict Checker (`#/conflicts`)

- FR-CONF-01: A textarea accepts one entry per line: CIDR, bare IP (assumed /32 or /128 with warning), or IPv4 `addr mask`. Blank lines and `#` comments are ignored. Invalid lines are reported with line numbers but do not abort the run.
- FR-CONF-02: Comparison happens within each family independently; families never conflict with each other.
- FR-CONF-03: Findings are grouped and classified using `relationOf`: **identical** entries, and **containment** chains (e.g. `10.0.0.0/8 ⊃ 10.1.0.0/16 ⊃ 10.1.2.0/24`). The report states explicitly that aligned CIDR blocks cannot partially overlap.
- FR-CONF-04: Clean result renders a positive "no overlaps found across N blocks" state.
- FR-CONF-05: Performance: 1 000 input lines must complete in under 1 s (sort by network address, then a single linear sweep — do not implement the naive O(n²) pairwise comparison).
- FR-CONF-06: Results exportable per F7.

Primary use case to keep in mind: pre-merge checks for VPN site-to-site address planning and client network mergers.

---

## 9. F6 — Context menu, F7 — Export, F8 — Persistence, UI

### 9.1 F6 — Context menu

- FR-CTX-01: Background registers one menu item, id `netcarve-analyse`, `contexts: ["selection"]`, title `Analyse "%s" in NetCarve`.
- FR-CTX-02: On click, run `findIpTokens(info.selectionText)`; open the app tab at `#/calc?q=<encodeURIComponent(token)>` for the first valid token.
- FR-CTX-03: If no valid token is found, open `#/calc?q=<raw selection, truncated to 128 chars>` so the user sees the friendly parse error rather than nothing happening.
- FR-CTX-04: The app route reads `q` once and cleans it from the URL (history.replaceState) so refresh does not re-trigger.

### 9.2 F7 — Export

- FR-EXP-01: **Markdown**: available from Calculator (single result), Planner (project table) and VLSM (solution). Planner columns, exactly: `Subnet | Mask | Range | Usable | Name | VLAN | Notes`. IPv6 rows leave Mask blank. A heading line carries the project name and root CIDR; a footer line carries `Generated by NetCarve — attv.uk` (can be disabled in Settings).
- FR-EXP-02: **CSV**: same columns, RFC 4180 quoting, UTF-8, CRLF, downloaded via an object-URL anchor (no extra permissions).
- FR-EXP-03: **JSON**: full project serialisation for backup, shape `{ "app": "netcarve", "schemaVersion": 1, "project": … }`. Import of the same shape restores a project; unknown `schemaVersion` is rejected with a clear message.
- FR-EXP-04: Clipboard writes use `navigator.clipboard.writeText` behind a user gesture, with a visible "copied" confirmation.

### 9.3 F8 — Storage

- Keys: `netcarve:projects` (array of Project), `netcarve:settings`, `netcarve:calcLast`.
- FR-STOR-01: All writes are debounced (500 ms) and versioned via `schemaVersion` inside each value.
- FR-STOR-02: Storage failures (quota) surface a non-blocking toast; the app keeps working in memory.
- FR-STOR-03: A Settings action "Export all data" downloads every project as one JSON file; "Delete all data" requires typed confirmation.

### 9.4 UI framework rules

- Design tokens as CSS custom properties; automatic dark mode via `prefers-color-scheme`, with a manual override (auto/light/dark) in Settings.
- Colour palette for planner blocks: exactly 8 named tokens (`blue, green, amber, red, violet, teal, pink, grey`), chosen to keep ≥ 4.5:1 contrast for text rendered on them in both themes.
- Full keyboard operability: the planner tree is navigable with arrow keys, `s` splits, `j` joins, `F2`/`Enter` edits the name. All interactive elements have visible focus states and ARIA labels.
- Monospace font for all addresses (`ui-monospace` stack).
- Empty states for: no projects, empty conflict checker, popup first run.

### 9.5 Data model (normative TypeScript)

```ts
interface Project {
  id: string;            // crypto.randomUUID()
  schemaVersion: 1;
  name: string;
  client?: string;
  notes?: string;
  createdAt: number;     // epoch ms
  updatedAt: number;
  roots: PlanNode[];
}

interface PlanNode {
  cidr: string;          // canonical string form, e.g. "10.20.0.0/16" or "2001:db8::/48"
  name?: string;
  colour?: PaletteToken; // leaves only
  vlanId?: number;       // 1–4094, leaves only
  notes?: string;        // leaves only
  children?: [PlanNode, PlanNode]; // present ⇒ internal node
}

type PaletteToken =
  | 'blue' | 'green' | 'amber' | 'red'
  | 'violet' | 'teal' | 'pink' | 'grey';

interface Settings {
  schemaVersion: 1;
  theme: 'auto' | 'light' | 'dark';
  allowSlash31: boolean;        // default false
  exportFooter: boolean;        // default true
  defaultCopyFormat: 'markdown' | 'plain';
}
```

Invariant (enforce in code and tests): a node's children are exactly `splitOnce(node.cidr)`; loading a project re-validates every node and quarantines a corrupt root rather than crashing the app.

---

## 10. Non-functional requirements

- NFR-PERF-01: Popup interactive in < 150 ms on a mid-range laptop; calculator recompute < 5 ms.
- NFR-PERF-02: Planner remains smooth (< 16 ms per interaction frame) at the 1 024-leaf limit.
- NFR-SIZE-01: Total shipped bundle (all entrypoints, gzipped) < 150 KB.
- NFR-PRIV-01: No analytics, no remote fonts, no remote requests of any kind. This is a store-listing selling point and must remain true.
- NFR-A11Y-01: WCAG 2.1 AA for contrast and keyboard access across all views.
- NFR-I18N-01: All user-facing strings live in one `strings.ts` module (British English). Structure must allow a future Polish locale without refactoring (future item, §13).
- NFR-QUAL-01: `src/lib/ip/**` — 100 % branch coverage; CI fails below that.

---

## 11. Testing strategy

1. **Unit tests (Vitest)** — table-driven vectors for every function in §4.2, explicitly covering: every §4.4 edge case; RFC 5952 formatting quirks (`2001:db8:0:0:1::1`, leftmost-run tie-break, no compression of a single zero group); parser rejections (leading-zero octets, double `::`, non-contiguous masks, prefix out of range); `findIpTokens` against messy prose containing punctuation-wrapped tokens and near-misses (e.g. `999.1.1.1`, version strings like `1.2.3.4000`).
2. **Algorithm tests** — the FR-VLSM acceptance vector plus failure/shortfall cases; conflict-sweep correctness against a brute-force O(n²) oracle on randomised inputs (property-style, seeded).
3. **Component smoke tests** — mount popup and planner with `@testing-library/preact`; assert the acceptance flows in §5/§6 at the DOM level.
4. **Manual QA checklist** (kept in `docs/qa.md`) — context-menu flow on a real page, dark mode, keyboard-only planner session, storage survives browser restart, import of an exported JSON.

---

## 12. Delivery plan

| Milestone | Scope | Done means |
|---|---|---|
| **M1 — Calculator MVP** | §3 skeleton, `lib/ip` complete with tests, F1+F2 in popup and `#/calc`, copy-as-Markdown, settings (theme only) | All FR-CALC + FR-INTEL pass; NFR-QUAL-01 green; installable unpacked build |
| **M2 — Planner + projects** | F3, F8, Markdown/CSV/JSON export for projects (F7) | FR-PLAN + FR-STOR + FR-EXP pass, including the §6 acceptance walkthrough |
| **M3 — Solver, conflicts, context menu** | F4, F5, F6, "Send to Planner" | FR-VLSM, FR-CONF, FR-CTX pass; performance target FR-CONF-05 measured |
| **M4 — Store release** | Icons, listing copy, screenshots, privacy policy page on attv.uk, review pass | Published on Chrome Web Store |

Store listing essentials (M4): single-purpose statement ("calculates and plans IP subnetting entirely on-device"), permission justifications for `storage` and `contextMenus`, "does not collect or transmit any user data" declaration, category Developer Tools.

---

## 13. Future ideas (explicitly out of scope now)

- NetBox-compatible export (prefix import format) — bridge to IPAM.
- LANgusta integration: use an exported NetCarve plan as seed inventory data.
- Supernetting/aggregation tool: given an arbitrary start–end range or block list, emit the minimal covering CIDR set.
- Polish locale.
- Firefox build via WXT.
- Shareable read-only plan via URL fragment encoding (needs careful size limits).

## 14. Open questions

1. **Name**: NetCarve vs PrefixLens. PrefixLens matches the LtdLens "Lens" family; NetCarve is more distinctive and describes the planner. Domain availability for either has **not** been checked and must be verified before M4.
2. Should the planner limit (FR-PLAN-04) be user-visible in Settings as read-only information, or silent until hit?
3. Whether M4 ships with a Polish store listing alongside the English one.
