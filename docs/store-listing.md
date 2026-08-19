# Chrome Web Store listing — NetCarve

Copy for the developer dashboard. British English throughout.

---

## Name

NetCarve — subnet calculator & address planner

## Short description (132 characters max)

> Plan address space, not just calculate it. IPv4/IPv6 subnetting, a visual planner, VLSM and
> conflict checks — all on your machine.

(129 characters.)

## Category

Developer Tools

## Single-purpose statement

NetCarve calculates and plans IP subnetting entirely on-device.

## Detailed description

**Plan address space, not just calculate it.**

Most subnet calculators answer one question: what is this subnet? NetCarve answers the one that
actually takes the time — how should this client's address space be laid out, and how do I get
that plan into the documentation?

**Quick calculator (IPv4 and IPv6)**
Paste anything: `10.20.0.0/16`, `192.168.1.37 255.255.255.0`, `2001:db8::/48`, even
`fe80::1%eth0`. You get the network, mask, wildcard, broadcast, first and last usable address,
the counts, and a bit ruler showing exactly where the network bits stop. Reserved ranges — RFC
1918, CGNAT, documentation blocks, link-local, ULA and the rest — are flagged as you type, with
deprecated allocations marked as such. Click any value to copy it, or take the whole result as
a Markdown table.

**Visual planner**
Keep named projects. Start from a root block and split it, split it again, or carve it straight
down to /24s in one step. Name each subnet, give it a VLAN ID and a colour, and watch the
utilisation bar fill. Join a branch back and NetCarve tells you exactly what you would lose
first. Undo and redo throughout. IPv6 works the same way, with /64s badged as the standard
subnet size.

**VLSM solver**
Give it a base network and a list of host counts. It sizes each requirement, allocates from the
lowest-addressed block that fits, and shows the waste alongside the leftover free blocks. One
click sends the whole solution into the planner as a named plan.

**Conflict checker**
Paste a list of blocks — a merger, a site-to-site VPN, an inherited spreadsheet — and see the
duplicates and containment chains immediately. A thousand lines checks in well under a second.

**Export that fits your documentation**
Markdown, CSV and JSON. The Markdown table drops straight into a client report; the JSON is a
complete backup you can import again later.

**Private by design**
NetCarve asks for two permissions: storage, and context menus. It has no site access, makes no
network requests of any kind, and contains no analytics. Every calculation happens in your
browser and every project stays in your browser profile. Nothing is ever sent anywhere.

Free, from attv.uk.

## Permission justifications

**storage** — NetCarve saves your projects, your settings and the last thing you typed into the
calculator in `chrome.storage.local`, so your plans survive closing the browser. Nothing is
synchronised or transmitted.

**contextMenus** — adds a single "Analyse … in NetCarve" item that appears only when text is
selected, so you can right-click an IP address or CIDR block on any page and open it in the
calculator. NetCarve receives only the text you have selected, and only when you click that
menu item.

**No host permissions** are requested; NetCarve cannot read any page.

## Data-use declarations

- Does **not** collect or use personally identifiable information.
- Does **not** collect or use health, financial, authentication, personal communications,
  location, web history or user activity data.
- Does **not** collect website content.
- Does **not** sell or transfer user data to third parties.
- Does **not** use or transfer user data for purposes unrelated to the item's single purpose.
- Does **not** use or transfer user data to determine creditworthiness or for lending.

## Privacy policy URL

https://www.attv.uk/netcarve/privacy

## Support and homepage

- Homepage: https://www.attv.uk
- Support: dev@attv.uk
- Source: https://github.com/AmigoUK/Netcarve

## Screenshots (1280 × 800)

1. **Popup calculator** — `192.168.1.37/24` analysed, bit ruler visible, RFC 1918 badge shown.
2. **Planner** — a `10.20.0.0/16` carved into named, colour-coded /18s with the utilisation bar.
3. **VLSM solver** — the Warehouse/Office/VoIP/Management allocation with its free block.
4. **Conflict checker** — a pasted list showing a containment chain.
5. **Dark mode** — the planner again, in the dark theme.
