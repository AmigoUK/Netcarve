import { describe, expect, it, vi } from 'vitest';
import {
  installContextMenu,
  MAX_SELECTION_LENGTH,
  MENU_ID,
  routeForSelection,
  type BackgroundApi,
  type MenuClickInfo,
} from '@/src/lib/menu';

function fakeApi() {
  const created: Array<{ id: string; title: string; contexts: string[] }> = [];
  const tabs: Array<{ url: string }> = [];
  let onInstalled: (() => void) | undefined;
  let onClicked: ((info: MenuClickInfo) => void) | undefined;
  const removeAll = vi.fn((callback: () => void) => callback());

  const api: BackgroundApi = {
    contextMenus: {
      removeAll,
      create: (properties) => created.push(properties),
      onClicked: { addListener: (listener) => (onClicked = listener) },
    },
    runtime: {
      onInstalled: { addListener: (listener) => (onInstalled = listener) },
      getURL: (path) => `chrome-extension://netcarve/${path}`,
    },
    tabs: { create: (properties) => tabs.push(properties) },
  };

  return {
    api,
    created,
    tabs,
    removeAll,
    install: () => onInstalled?.(),
    click: (info: MenuClickInfo) => onClicked?.(info),
  };
}

describe('routeForSelection (FR-CTX-02/03)', () => {
  it.each([
    ['10.0.0.0/8', '/calc?q=10.0.0.0%2F8'],
    ['The block (10.0.0.0/8) is private.', '/calc?q=10.0.0.0%2F8'],
    ['peer 2001:db8::1 up', '/calc?q=2001%3Adb8%3A%3A1'],
    ['network 10.0.0.0 255.255.255.0', '/calc?q=10.0.0.0%20255.255.255.0'],
  ])('picks the first valid token out of %s', (selection, route) => {
    expect(routeForSelection(selection)).toBe(route);
  });

  it('falls back to the raw selection so the user sees a parse error', () => {
    expect(routeForSelection('not an address')).toBe('/calc?q=not%20an%20address');
  });

  it('truncates a very long selection', () => {
    const long = 'x'.repeat(500);
    const route = routeForSelection(long);
    expect(decodeURIComponent(route.replace('/calc?q=', ''))).toHaveLength(MAX_SELECTION_LENGTH);
  });

  it('copes with no selection at all', () => {
    expect(routeForSelection(undefined)).toBe('/calc?q=');
  });
});

describe('installContextMenu (FR-CTX-01)', () => {
  it('registers exactly one item for selections, after clearing any old one', () => {
    const context = fakeApi();
    installContextMenu(context.api);
    context.install();

    expect(context.removeAll).toHaveBeenCalledTimes(1);
    expect(context.created).toEqual([
      { id: MENU_ID, title: 'Analyse "%s" in NetCarve', contexts: ['selection'] },
    ]);
  });

  it('opens the app at the calculator for the selection', () => {
    const context = fakeApi();
    installContextMenu(context.api);
    context.click({ menuItemId: MENU_ID, selectionText: 'see 192.168.1.0/24 here' });

    expect(context.tabs).toEqual([
      { url: 'chrome-extension://netcarve/app.html#/calc?q=192.168.1.0%2F24' },
    ]);
  });

  it('ignores clicks on any other menu item', () => {
    const context = fakeApi();
    installContextMenu(context.api);
    context.click({ menuItemId: 'something-else', selectionText: '10.0.0.0/8' });
    expect(context.tabs).toEqual([]);
  });
});
