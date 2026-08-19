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
| **Context menu** — select an IP or CIDR on any page and analyse it | Right-click → *Analyse "…" in NetCarve* |
| **Export** — Markdown, CSV and JSON, ready for client documentation | Everywhere |

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
```

Load the unpacked extension from `.output/chrome-mv3` via `chrome://extensions` → *Load unpacked*.

## Documentation

- [`docs/spec.md`](docs/spec.md) — the product specification this implementation follows
- [`docs/superpowers/plans/2026-08-19-netcarve.md`](docs/superpowers/plans/2026-08-19-netcarve.md) — the implementation plan
- [`DECISIONS.md`](DECISIONS.md) — engineering decisions and resolved open questions
- [`CHANGELOG.md`](CHANGELOG.md) — release history
- [`docs/qa.md`](docs/qa.md) — manual QA checklist

## Credits

dev@attv.uk · Project & Development: Tomasz 'Amigo' Lewandowski · [www.attv.uk](https://www.attv.uk) ·
[GitHub](https://github.com/AmigoUK/Netcarve)

MIT licensed.
