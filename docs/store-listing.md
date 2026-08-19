# Chrome Web Store submission sheet — NetCarve

Everything the developer dashboard asks for, in the order it asks for it, ready to copy and
paste. British English throughout. Assets live in `docs/store/`; regenerate them with
`npm run screenshots`.

---

## 1. Package

| Field | Value |
|---|---|
| Build | `npm run zip` → `.output/netcarve-<version>-chrome.zip` |
| Manifest | v3 |
| Permissions | `storage`, `contextMenus` — no host permissions, no content scripts |
| Remote code | **No.** Everything executed ships inside the package. |

---

## 2. Store listing

### Item name

> NetCarve — subnet calculator & address planner

_(46 of 75 characters.)_

### Summary — "short description"

> Plan address space, not just calculate it. IPv4/IPv6 subnetting, a visual planner, VLSM and conflict checks — all on your machine.

_(130 of 132 characters.)_

### Category

**Developer Tools**

### Language

English (United Kingdom)

### Description

<!-- paste everything between the rules -->

---

**Plan address space, not just calculate it.**

Most subnet calculators answer one question: what is this subnet? NetCarve answers the one that
actually takes the time — how should this client's address space be laid out, and how do I get
that plan into the documentation?

**Quick calculator (IPv4 and IPv6)**
Paste anything: 10.20.0.0/16, 192.168.1.37 255.255.255.0, 2001:db8::/48, even fe80::1%eth0. You
get the network, mask, wildcard, broadcast, first and last usable address, the counts, and a bit
ruler showing exactly where the network bits stop. Reserved ranges — RFC 1918, CGNAT,
documentation blocks, link-local, ULA and the rest — are flagged as you type, with deprecated
allocations marked as such. Click any value to copy it, or take the whole result as a Markdown
table. Drag the prefix slider and every figure retunes as you go.

**Visual planner**
Keep named projects. Start from a root block and split it, split it again, or carve it straight
down to /24s in one step. Name each subnet, give it a VLAN ID and a colour, and watch the
utilisation bar fill. Join a branch back and NetCarve tells you exactly what you would lose
first. Undo and redo throughout, and the whole tree is keyboard-driven: arrow keys move, S
splits, J joins, F2 renames. IPv6 works the same way, with /64s badged as the standard subnet
size.

**VLSM solver**
Give it a base network and a list of host counts. It sizes each requirement, allocates from the
lowest-addressed block that fits, and shows the waste alongside the leftover free blocks. If a
requirement does not fit, it tells you by how many addresses. One click sends the whole solution
into the planner as a named plan.

**Conflict checker**
Paste a list of blocks — a merger, a site-to-site VPN, an inherited spreadsheet — and see the
duplicates and containment chains immediately. Comments and blank lines are ignored; bad lines
are named rather than silently dropped. IPv4 and IPv6 are compared separately.

**Export that fits your documentation**
Markdown, CSV and JSON. The Markdown table drops straight into a client report; the JSON is a
complete backup you can import again later.

**Private by design**
NetCarve asks for two permissions: storage, and context menus. It has no site access, makes no
network requests of any kind, and contains no analytics. Every calculation happens in your
browser and every project stays in your browser profile. Nothing is ever sent anywhere.

Free, from attv.uk.

---

### Graphic assets

| Dashboard field | File | Size |
|---|---|---|
| Store icon | `docs/store/icon-512.png` (or `public/icon/128.png`) | 512 × 512 / 128 × 128 |
| Screenshot 1 | `docs/store/screenshots/01-popup-calculator.png` | 1280 × 800 |
| Screenshot 2 | `docs/store/screenshots/02-planner.png` | 1280 × 800 |
| Screenshot 3 | `docs/store/screenshots/03-vlsm-solver.png` | 1280 × 800 |
| Screenshot 4 | `docs/store/screenshots/04-conflict-checker.png` | 1280 × 800 |
| Screenshot 5 | `docs/store/screenshots/05-planner-dark.png` | 1280 × 800 |
| Small promo tile | `docs/store/promo-small-440x280.png` | 440 × 280 |
| Marquee promo tile | `docs/store/promo-marquee-1400x560.png` | 1400 × 560 |

Suggested screenshot captions (optional in the dashboard, useful if you add them):

1. The calculator lives in the toolbar — masks, ranges and reserved-range notes as you type.
2. Carve a block into named, colour-coded subnets and watch the utilisation fill.
3. Turn host counts into an allocation, with the waste and the free blocks shown.
4. Find duplicates and containment before a merge or a site-to-site VPN.
5. The whole plan in the dark theme.

### Support and links

| Field | Value |
|---|---|
| Homepage URL | `https://www.attv.uk` |
| Support URL | `https://github.com/AmigoUK/Netcarve/issues` |
| Support email | `dev@attv.uk` |
| Privacy policy URL | `https://www.attv.uk/netcarve/privacy` (publish `docs/privacy.md` there first) |

---

## 3. Privacy practices

### Single purpose

> NetCarve calculates and plans IP subnetting entirely on-device.

### Permission justifications

**storage**

> NetCarve saves your projects, your settings and the last thing you typed into the calculator in chrome.storage.local, so your plans survive closing the browser. Nothing is synchronised or transmitted.

**contextMenus**

> NetCarve adds a single "Analyse … in NetCarve" item that appears only when text is selected, so you can right-click an IP address or CIDR block on any page and open it in the calculator. NetCarve receives only the text you have selected, and only when you click that menu item.

**Host permissions**

> None requested. NetCarve cannot read the pages you visit.

**Remote code**

> No, I am not using remote code. All logic ships inside the package.

### Data usage — tick nothing

NetCarve collects none of the categories the dashboard lists:

- [ ] Personally identifiable information
- [ ] Health information
- [ ] Financial and payment information
- [ ] Authentication information
- [ ] Personal communications
- [ ] Location
- [ ] Web history
- [ ] User activity
- [ ] Website content

### The three certifications

All three can be certified truthfully:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

---

## 4. Before you press submit

- [ ] `npm test` — unit and component tests pass.
- [ ] `npm run test:e2e` (or `test:e2e:xvfb` on a headless machine) — the end-to-end suite passes
      against the real build.
- [ ] `npm run typecheck` — clean.
- [ ] `npm run screenshots` — assets regenerated from the version being shipped, so the version
      shown in the popup matches the package.
- [ ] `npm run zip` — the archive to upload.
- [ ] The version in `package.json`, the manifest, the CHANGELOG entry and the git tag all agree.
- [ ] `docs/privacy.md` is live at the privacy policy URL above.
- [ ] `docs/qa.md` walked through once on a real profile.
