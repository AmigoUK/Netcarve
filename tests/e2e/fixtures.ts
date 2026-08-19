import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The production build the whole suite runs against. */
export const EXTENSION_PATH = fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url));

interface ExtensionFixtures {
  context: BrowserContext;
  /** The `chrome-extension://…` id the profile assigned to this build. */
  extensionId: string;
  /** The MV3 service worker, already awake. */
  background: Worker;
  /** A fresh tab on `app.html`, with storage cleared. */
  app: Page;
}

/**
 * Launches a throwaway Chrome profile with the unpacked extension loaded.
 *
 * `--load-extension` needs a real browser window; the npm script wraps the run in
 * `xvfb-run` so the same command works on a headless machine.
 */
export const test = base.extend<ExtensionFixtures>({
  context: async ({ }, use) => {
    const profile = await mkdtemp(join(tmpdir(), 'netcarve-e2e-'));
    const context = await chromium.launchPersistentContext(profile, {
      headless: false,
      channel: 'chromium',
      viewport: { width: 1280, height: 800 },
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-search-engine-choice-screen',
        '--hide-scrollbars',
      ],
    });
    // The export buttons write to the clipboard; without this Chrome silently refuses and
    // `copyText` resolves to `false`, which would make the assertions untestable.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await use(context);
    await context.close();
    await rm(profile, { recursive: true, force: true });
  },

  background: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },

  extensionId: async ({ background }, use) => {
    await use(new URL(background.url()).host);
  },

  app: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/app.html#/calc`);
    await page.waitForSelector('.nc-shell');
    await use(page);
    await page.close();
  },
});

export const expect = test.expect;

/** Wipes every NetCarve key from the profile and reloads, so a test starts from nothing. */
export async function resetStorage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await chrome.storage.local.clear();
  });
  await page.reload();
  await page.waitForSelector('.nc-shell');
}

/** Navigates the hash router and waits for the shell to settle on the new route. */
export async function goToRoute(page: Page, route: string): Promise<void> {
  await page.evaluate((target) => {
    globalThis.location.hash = target;
  }, route);
  await page.waitForTimeout(150);
}

/** Reads a NetCarve storage key straight out of `chrome.storage.local`. */
export async function readStorage(page: Page, key: string): Promise<unknown> {
  return page.evaluate(async (name) => (await chrome.storage.local.get(name))[name], key);
}

/** Whatever the page last put on the clipboard. */
export async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}
