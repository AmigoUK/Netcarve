/**
 * The context-menu integration (F6), kept framework-free so it can be tested against a fake
 * `chrome` API rather than a real browser.
 *
 * The worker does one thing: register a single item for text selections, and open the app's
 * calculator on the first address it can find in the selection.
 */

import { findIpTokens } from './ip/tokens';
import { strings } from '../strings';

export const MENU_ID = 'netcarve-analyse';

/** How much of an unrecognised selection is carried through (FR-CTX-03). */
export const MAX_SELECTION_LENGTH = 128;

export interface MenuClickInfo {
  readonly menuItemId: string | number;
  readonly selectionText?: string;
}

export interface BackgroundApi {
  contextMenus: {
    removeAll(callback: () => void): void;
    create(properties: { id: string; title: string; contexts: string[] }): void;
    onClicked: { addListener(listener: (info: MenuClickInfo) => void): void };
  };
  runtime: {
    onInstalled: { addListener(listener: () => void): void };
    getURL(path: string): string;
  };
  tabs: { create(properties: { url: string }): void };
}

/**
 * The app route for a selection: the first valid address or block, or — when there is none —
 * the raw selection truncated, so the user sees a friendly parse error rather than nothing
 * happening at all (FR-CTX-02/03).
 */
export function routeForSelection(selectionText: string | undefined): string {
  const selection = selectionText ?? '';
  const [token] = findIpTokens(selection);
  const query = token?.text ?? selection.trim().slice(0, MAX_SELECTION_LENGTH);
  return `/calc?q=${encodeURIComponent(query)}`;
}

/** Registers the menu item and its click handler. */
export function installContextMenu(api: BackgroundApi): void {
  api.runtime.onInstalled.addListener(() => {
    // Re-creating the item would throw on a duplicate id, so clear first.
    api.contextMenus.removeAll(() => {
      api.contextMenus.create({
        id: MENU_ID,
        title: strings.contextMenu.analyse,
        contexts: ['selection'],
      });
    });
  });

  api.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== MENU_ID) return;
    const route = routeForSelection(info.selectionText);
    api.tabs.create({ url: `${api.runtime.getURL('app.html')}#${route}` });
  });
}
