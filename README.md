<div align="center">

<img src="public/icon/128.png" width="96" alt="NetCarve" />

# NetCarve

**Plan address space, not just calculate it.**

An IP subnet calculator, visual address planner and VLSM solver for Chrome —
running entirely on your own machine.

</div>

---

## What it does

| Feature | Where |
|---|---|
| **Quick calculator** — IPv4 and IPv6, masks, ranges, usable counts, binary/hextet breakdown | Toolbar popup and `#/calc` |
| **Visual planner** — persistent projects, split/join a block tree, named and colour-coded subnets, VLAN IDs | `#/planner/:projectId` |
| **VLSM solver** — turn host-count requirements into an optimal allocation | `#/vlsm` |
| **Conflict checker** — paste a list of CIDRs, find duplicates and containment | `#/conflicts` |
| **Tools** — DEC/HEX/BIN converter with a clickable bit field, bitwise operations, mask ↔ prefix | `#/tools` |
| **Context menu** — select an IP or CIDR on any page and analyse it | Right-click → *Analyse "…" in NetCarve* |
| **Export** — Markdown, plain text, CSV and JSON, ready for client documentation | Everywhere |

## Install it

NetCarve is not on the Chrome Web Store yet. Grab
`netcarve-<version>-chrome.zip` from the
[latest release](https://github.com/AmigoUK/Netcarve/releases/latest), unzip it, then in Chrome
open `chrome://extensions`, turn on **Developer mode** and press **Load unpacked** on the
unzipped folder.

Step-by-step instructions, including Edge and how to update an existing install, are in
[`docs/install.md`](docs/install.md).

## Privacy

NetCarve requests exactly two permissions — `storage` and `contextMenus` — and makes **no network
requests at all**. There is no backend, no analytics, no remote fonts. Every calculation happens in
your browser and every project stays in `chrome.storage.local`.

## Development

```bash
npm install         # install dependencies (also runs `wxt prepare`)
npm run dev         # launch Chrome with the extension loaded, hot reload
npm run build       # production build into .output/chrome-mv3
npm run zip         # store-ready archive
npm test            # unit and component tests (Vitest)
npm run coverage    # coverage; src/lib/ip must stay at 100 % branches
npm run typecheck   # tsc --noEmit
npm run test:e2e    # end-to-end suite against the real build (Playwright + Chrome)
npm run screenshots # regenerate the Chrome Web Store assets in docs/store/
```

The end-to-end suite runs headless — Chromium's new headless mode loads unpacked extensions,
so no display server is involved. To watch a run in a real window while debugging:

```bash
npm run test:e2e:headed
```

Load the unpacked extension from `.output/chrome-mv3` via `chrome://extensions` → *Load unpacked*.

### Quality gates

| Gate | Where | Status |
|---|---|---|
| 100 % branch coverage of `src/lib/ip` | `vitest.config.ts` thresholds, enforced in CI | enforced |
| Manifest permissions limited to `storage` + `contextMenus` | `tests/e2e/extension.spec.ts` | enforced |
| No network call anywhere in the shipped bundle | `tests/e2e/privacy.spec.ts` — static scan plus a live request monitor across every view | enforced |
| No WCAG 2.1 A/AA violations | `tests/e2e/a11y.spec.ts` — axe-core on every route, both themes and the popup | enforced |
| Bundle under 150 KB gzipped | `tests/e2e/privacy.spec.ts` | enforced (~44 KB) |

### Releasing

```bash
node scripts/release.mjs <version> "<summary>" <notes-file>
```

Bumps `package.json`, folds the notes into `CHANGELOG.md`, commits, tags and opens the GitHub
release in one step.

## Documentation

- [`docs/spec.md`](docs/spec.md) — the product specification this implementation follows
- [`docs/superpowers/plans/2026-08-19-netcarve.md`](docs/superpowers/plans/2026-08-19-netcarve.md) — the implementation plan
- [`DECISIONS.md`](DECISIONS.md) — engineering decisions and resolved open questions
- [`CHANGELOG.md`](CHANGELOG.md) — release history
- [`docs/install.md`](docs/install.md) — installing a release without a toolchain
- [`docs/qa.md`](docs/qa.md) — manual QA checklist
- [`docs/store-listing.md`](docs/store-listing.md) — the Chrome Web Store submission sheet, with
  every field ready to paste and the asset checklist

## Credits

dev@attv.uk · Project & Development: Tomasz 'Amigo' Lewandowski · [www.attv.uk](https://www.attv.uk) ·
[GitHub](https://github.com/AmigoUK/Netcarve)

MIT licensed.
