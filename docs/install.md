# Installing NetCarve from a release

NetCarve is not on the Chrome Web Store yet, so it installs as an unpacked extension. It takes
about a minute and needs no build tools.

The download is the same archive the store submission uses: fourteen files, no installer, no
network access.

---

## Chrome, Edge, Brave, Opera and other Chromium browsers

1. **Download** `netcarve-<version>-chrome.zip` from the
   [latest release](https://github.com/AmigoUK/Netcarve/releases/latest).
2. **Unzip it** somewhere you will not delete by accident — the browser reads the extension from
   this folder every time it starts, so a Downloads folder that gets cleared out is a poor
   choice. `~/Extensions/netcarve` or `Documents\Extensions\netcarve` works well.
   After unzipping you should see `manifest.json` sitting at the top of the folder.
3. **Open the extensions page:**
   - Chrome, Brave, Opera → `chrome://extensions`
   - Edge → `edge://extensions`
4. **Turn on Developer mode** — the toggle is top-right in Chrome, bottom-left in Edge.
5. **Click "Load unpacked"** and select the folder from step 2 — the one containing
   `manifest.json`, not the zip and not its parent.
6. NetCarve appears in the list. **Pin it** to the toolbar from the puzzle-piece icon so the
   calculator is one click away.

### What you should see

- Two permissions, and only two: *Storage* and *Context menus*. No site access at all — the
  extensions page will say NetCarve cannot read or change any data on the sites you visit.
- A NetCarve icon in the toolbar. Clicking it opens the quick calculator.
- Selecting an IP address anywhere and right-clicking gives you
  *Analyse "…" in NetCarve*.

---

## Updating

Unpacked extensions do not update themselves. To move to a newer release:

1. Download and unzip the new version **over the same folder**, replacing the old files.
2. Go back to the extensions page and press the refresh arrow on the NetCarve card.

Your projects survive this: they live in the browser profile, not in the extension folder.

To move to a different folder instead, remove the old entry first, then *Load unpacked* the new
one — but note that a new folder means a new extension id, and the projects stored against the
old id will not follow it. Export your projects first (Settings → *Export all data*) if you plan
to do that.

---

## Removing it

Extensions page → *Remove*. That deletes the extension's storage with it, so export anything you
want to keep first.

---

## Frequently hit snags

**"Manifest file is missing or unreadable"** — you selected the wrong folder. Pick the one that
directly contains `manifest.json`; if unzipping produced a folder inside a folder, go one level
deeper.

**The Developer-mode banner keeps reappearing on every start** — that is Chrome reminding you an
unpacked extension is loaded. It is expected, and it goes away when NetCarve is installed from
the Web Store.

**Your organisation blocks Developer mode** — a managed Chrome profile can forbid unpacked
extensions entirely. There is no way around that from this side; you will need the Web Store
release, or an administrator to allow the extension.

**The toolbar icon does nothing** — check the extensions page for an error on the NetCarve card.
If the archive was only partly unzipped, `background.js` may be missing; unzip it again.

---

## Building it yourself instead

```bash
git clone https://github.com/AmigoUK/Netcarve.git
cd Netcarve
npm install
npm run build     # → .output/chrome-mv3, ready for Load unpacked
npm run zip       # → .output/netcarve-<version>-chrome.zip, the same archive as the release
```

Every release is built from the tag of the same name, so the archive attached to a release and
the one you build from that tag contain the same files.
