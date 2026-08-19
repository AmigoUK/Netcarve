# NetCarve — privacy policy

_Last updated: 19 August 2026. Publish at https://www.attv.uk/netcarve/privacy._

## The short version

NetCarve does not collect anything. It has no server, makes no network requests, and contains
no analytics. Everything you type stays in your own browser.

## What NetCarve stores, and where

NetCarve keeps three things in `chrome.storage.local`, which is part of your browser profile on
your own machine:

| Key | Contents |
|---|---|
| `netcarve:projects` | Your address plans: project names, optional client names and notes, and the blocks you have carved, named and coloured. |
| `netcarve:settings` | Your preferences: theme, whether /31 links are allowed, whether exports carry a credit line, and your default copy format. |
| `netcarve:calcLast` | The last thing you typed into the quick calculator, so the popup reopens where you left off. |

This data is never transmitted. It is not synchronised between devices. Uninstalling the
extension, or using **Settings → Delete all data**, removes it.

## Permissions, and why each one exists

**storage** — so your projects and settings survive closing the browser.

**contextMenus** — so a single "Analyse … in NetCarve" item can appear when you right-click
selected text. NetCarve receives the selected text only, and only at the moment you click that
item. It is used to fill in the calculator and is not stored.

NetCarve requests **no host permissions**, so it cannot read the pages you visit.

## What NetCarve does not do

- No analytics, telemetry, crash reporting or usage statistics.
- No accounts, sign-in or cloud synchronisation.
- No advertising, and no data sold or shared with anyone.
- No remote code, remote fonts or remote images: everything ships inside the extension.
- No network requests at all. You can verify this yourself with the Network tab of DevTools
  open on the extension's pages.

## Files you export

Markdown, CSV and JSON exports are written straight to your own downloads folder or clipboard
by your browser. They do not pass through any service.

## Children

NetCarve is a developer tool and is not directed at children. It collects no data from anyone,
of any age.

## Changes

If this policy ever changes, the new version will be published at the URL above with an updated
date, and the change will be noted in the extension's changelog.

## Contact

dev@attv.uk — attv.uk, United Kingdom.
