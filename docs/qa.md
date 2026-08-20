# NetCarve — manual QA checklist

Run this before every release that touches the UI, and in full before a Chrome Web Store
submission. Automated coverage lives in `tests/`: `tests/lib` and `tests/ui` under Vitest, and
`tests/e2e` driving the packed extension in a real Chrome (`npm run test:e2e`), which already
asserts the manifest, every view, the context-menu contract, exports, storage, accessibility,
the performance claims and the absence of network calls. This list covers what a test runner
cannot see — how it feels, how it reads, and how it behaves in a real profile. Tick the boxes in a scratch copy, not in the repository.

Build under test: `npm run build` → load `.output/chrome-mv3` via `chrome://extensions` →
*Load unpacked*.

---

## 0. Before the manual pass

- [ ] `npm run test:e2e` — includes `layout.spec.ts`, which fails on anything overflowing its
      container across every route, both themes and 1280/1024/768 px, and on anything at all
      overflowing inside the 400 px popup.
- [ ] `npm run preview` — renders every view in both themes into `.output/preview`. **Open
      them.** The measurements above cannot see a row that is merely ugly; that still takes an
      eye, and this is where the last three layout defects were finally spotted.

## 1. Install and permissions

- [ ] `chrome://extensions` shows the NetCarve icon at 16, 48 and 128 px, all legible.
- [ ] The permissions warning on install mentions **nothing** beyond storage and context menus.
- [ ] `chrome://extensions` → *Details* → *Permissions* lists no site access.
- [ ] Open DevTools → Network on both the popup and the app, use every feature: **zero**
      requests leave the extension (NFR-PRIV-01).

## 2. Popup (F1)

- [ ] The popup opens in well under a second and the input already has focus.
- [ ] Typing `192.168.1.37/24` gives network `192.168.1.0`, mask `255.255.255.0`, broadcast
      `192.168.1.255`, 254 usable, and the RFC 1918 badge.
- [ ] `10.0.0.0 255.255.255.0`, `2001:db8::1/48`, `::ffff:10.0.0.1` and `fe80::1%eth0` all
      produce a result rather than an error.
- [ ] The prefix stepper and slider update every value live.
- [ ] Clicking a value copies it; the "Copied" confirmation appears and fades.
- [ ] *Copy as Markdown* pastes a complete table into a text editor.
- [ ] Close and reopen the popup: the last input is still there (FR-CALC-07).
- [ ] *Open the full app* opens a tab with the same input already in the box.

## 3. Context menu (F6)

- [ ] On a real page (a GitHub README, an RFC), select `10.0.0.0/8` → right-click → *Analyse
      "10.0.0.0/8" in NetCarve* → a tab opens with the block analysed.
- [ ] Select a sentence containing an address; the address alone is picked out.
- [ ] Select text with no address; the calculator opens showing a friendly parse error.
- [ ] Refresh that tab: the analysis does **not** re-trigger and the URL no longer holds `?q=`.

## 4. Planner (F3)

- [ ] Create a project with a name and a client; it opens straight into the planner.
- [ ] Add root `10.20.0.0/16`. Adding `10.20.1.0/24` is refused with a message naming the
      existing block.
- [ ] Split once, then split the first half. Rows stay in address order.
- [ ] Name a leaf, set VLAN 10, pick a colour from the swatch grid. Entering VLAN 9999 is
      refused with an explanation.
- [ ] *Split to…* with target /27 on a /16 is refused, naming the 1,024 limit; /24 succeeds and
      renders 256 rows without the page stuttering (NFR-PERF-02).
- [ ] Join the root: the confirmation counts the named subnets that would be lost.
- [ ] Undo restores them; redo removes them again.
- [ ] Keyboard only, no mouse: Tab to the tree, arrow keys move the selection, `S` splits, `J`
      joins, `F2` opens the name field, Escape leaves it. Focus is always visible.
- [ ] The utilisation meter matches what has been named.
- [ ] Add an IPv6 root, split down to a /64: the standard-subnet badge appears.

## 5. Persistence (F8)

- [ ] Edit a plan, wait a second, quit Chrome entirely, reopen: the plan is intact.
- [ ] Open the same project in two tabs, edit in one, reload the other: no crash, no data loss.
- [ ] Hand-edit `netcarve:projects` in DevTools → Application → Storage to corrupt one root's
      children, reload: the app still opens, the bad root is set aside and a toast says so.

## 6. Export and import (F7)

- [ ] Planner → *Copy as Markdown* pastes with the columns
      `Subnet | Mask | Range | Usable | Name | VLAN | Notes`; an IPv6 row leaves Mask blank.
- [ ] *Download CSV* opens in a spreadsheet with the columns intact, including a name
      containing a comma.
- [ ] *Download JSON*, then Projects → *Import JSON* on that file restores the plan.
- [ ] Edit the exported file's `schemaVersion` to `2` and import: refused with a clear message.
- [ ] Settings → *Export all data* writes every project into one file.

## 6a. Tools (F9)

- [ ] `#/tools` → type `192.168.1.1`: decimal `3232235777`, hex `0xC0A80101`, binary in four
      octets, and the IPv4 row all agree.
- [ ] The 8- and 16-bit widths are disabled and say why on hover; 32 is selected.
- [ ] Type `0xFF`, switch to 8 bits, then type `192.168.1.1`: the panel moves to 32 bits rather
      than showing an error you cannot clear.
- [ ] Click a bit: every base updates and the set-bit count follows.
- [ ] Type `C0A8`: the message explains that hexadecimal needs `0x`, rather than reading it as
      decimal.
- [ ] Bitwise: `10.20.30.40` AND `255.255.0.0` gives `10.20.0.0`. NOT on `255.255.255.0` gives
      `0.0.0.255` and hides the second operand.
- [ ] Masks: prefix 26 gives `255.255.255.192` and wildcard `0.0.0.63`; typing
      `255.255.240.0` gives back 20; `255.0.255.0` is refused as non-contiguous.
- [ ] Copy as Markdown pastes a Base/Value table.
- [ ] From the calculator, *Open in converter* carries the network address across.
- [ ] Keyboard only: the width radios, the value field, every bit and the export button are all
      reachable, with visible focus.

## 7. Solver and conflicts (F4, F5)

- [ ] VLSM: base `192.168.10.0/24`, requirements Warehouse 120, Office 50, VoIP 20,
      Management 10 → the four blocks from §7 of the spec and one free `192.168.10.240/28`.
- [ ] Turn on *Allow /31 for two-host links* in Settings; a two-host requirement becomes a /31.
- [ ] Ask for more than fits: the shortfall names the requirement and the missing addresses,
      and the allocations that did fit are still shown.
- [ ] *Send to planner* into a new project, then into an existing one.
- [ ] Conflicts: paste 1,000 lines; the report appears immediately (FR-CONF-05).
- [ ] A list with duplicates and nested blocks reports both; a clean list says so.

## 8. Presentation

- [ ] Settings → Dark: popup and app both switch immediately; reopen the popup and it is still
      dark. Light and Match-the-system behave the same way.
- [ ] With the OS in dark mode and the theme on *Match the system*, both surfaces are dark.
- [ ] Every address is monospaced; nothing is clipped at 400 px (popup) or 320 px (app).
- [ ] The credit footer appears on every app page and not in the popup.
- [ ] Check contrast with DevTools → Accessibility on: body text, muted hints, the eight
      planner swatches and the bit ruler all pass AA (NFR-A11Y-01).

## 9. Pre-submission (M4)

- [ ] `npm run typecheck`, `npm test` and `npm run coverage` all clean; `src/lib/ip` still at
      100 % branches.
- [ ] `npm run zip` produces the store archive.
- [ ] Store listing copy in `docs/store-listing.md` is current, including the permission
      justifications.
- [ ] The privacy policy in `docs/privacy.md` is published at its attv.uk URL and linked from
      the listing.
- [ ] **Domain availability for the NetCarve name has been checked** (spec §14.1).
- [ ] Screenshots retaken at 1280 × 800: popup, planner, VLSM solver, conflict checker.
