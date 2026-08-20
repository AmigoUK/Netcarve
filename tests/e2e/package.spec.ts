import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, chromium, type BrowserContext } from '@playwright/test';

/**
 * The release artifact itself.
 *
 * Everything else in this suite runs against the build directory; this file runs against the
 * **zip a user actually downloads**, unpacked exactly the way `docs/install.md` tells them to.
 * It is the last thing between a green build and someone loading a broken folder.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VERSION = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string })
  .version;
const ARCHIVE = join(ROOT, '.output', `netcarve-${VERSION}-chrome.zip`);

/** Files the archive must contain for the extension to work at all. */
const REQUIRED = [
  'manifest.json',
  'background.js',
  'popup.html',
  'app.html',
  'icon/16.png',
  'icon/48.png',
  'icon/128.png',
];

test.describe('the release archive', () => {
  test.skip(
    () => !existsSync(ARCHIVE),
    `no archive at ${ARCHIVE} — run \`npm run zip\` first`,
  );

  let unpacked: string;
  let context: BrowserContext | undefined;

  test.beforeAll(async () => {
    unpacked = await mkdtemp(join(tmpdir(), 'netcarve-package-'));
    execFileSync('unzip', ['-q', ARCHIVE, '-d', unpacked]);
  });

  test.afterAll(async () => {
    await context?.close();
    await rm(unpacked, { recursive: true, force: true });
  });

  test('unpacks straight to a loadable folder', () => {
    for (const file of REQUIRED) {
      expect(existsSync(join(unpacked, file)), `${file} is missing from the archive`).toBe(true);
    }
  });

  test('declares the version, the two permissions and nothing else', () => {
    const manifest = JSON.parse(readFileSync(join(unpacked, 'manifest.json'), 'utf8')) as {
      manifest_version: number;
      version: string;
      permissions: string[];
      host_permissions?: string[];
      content_scripts?: unknown[];
    };

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe(VERSION);
    expect(manifest.permissions.sort()).toEqual(['contextMenus', 'storage']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
  });

  test('loads into a browser and runs', async () => {
    const profile = await mkdtemp(join(tmpdir(), 'netcarve-package-profile-'));
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      channel: 'chromium',
      viewport: { width: 1280, height: 800 },
      args: [
        `--disable-extensions-except=${unpacked}`,
        `--load-extension=${unpacked}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-search-engine-choice-screen',
      ],
    });

    const worker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;

    // The popup is what the toolbar button opens, so it is the thing that must work.
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.getByLabel('IP address or CIDR block').fill('10.20.0.0/16');
    await expect(popup.locator('.nc-calc__network')).toHaveText('10.20.0.0');
    await popup.close();

    const app = await context.newPage();
    await app.goto(`chrome-extension://${id}/app.html#/calc`);
    await expect(app.locator('.nc-shell')).toBeVisible();
    await app.close();

    await rm(profile, { recursive: true, force: true });
  });
});
