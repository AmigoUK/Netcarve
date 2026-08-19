import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, EXTENSION_PATH } from './fixtures';

const manifest = JSON.parse(
  readFileSync(join(EXTENSION_PATH, 'manifest.json'), 'utf8'),
) as Record<string, any>;

const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

test.describe('the packed extension', () => {
  test('is manifest v3 and carries the released version', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.name).toBe('NetCarve — subnet calculator & address planner');
    expect(manifest.short_name).toBe('NetCarve');
  });

  test('asks for storage and contextMenus and nothing else (NFR-PERM-01)', () => {
    expect([...manifest.permissions].sort()).toEqual(['contextMenus', 'storage']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
  });

  test('ships every icon size the store asks for', () => {
    for (const size of ['16', '32', '48', '96', '128']) {
      expect(manifest.icons[size]).toBe(`/icon/${size}.png`);
      expect(readFileSync(join(EXTENSION_PATH, 'icon', `${size}.png`)).byteLength).toBeGreaterThan(
        0,
      );
    }
  });

  test('registers a service worker that stays reachable', async ({ background }) => {
    expect(background.url()).toContain('background.js');
    const hasMenus = await background.evaluate(() => typeof chrome.contextMenus === 'object');
    expect(hasMenus).toBe(true);
  });

  test('opens the popup as a standalone extension page', async ({ context, extensionId }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator('.nc-popup__mark-name')).toHaveText('NetCarve');
    await expect(popup.locator('.nc-popup__mark-version')).toHaveText(`v${pkg.version}`);
    await expect(popup.getByRole('button', { name: /Open the full app/ })).toBeVisible();
    await popup.close();
  });

  test('reports the released version in the app footer', async ({ app }) => {
    await expect(app.locator('.nc-credit')).toContainText(`v${pkg.version}`);
    await expect(app.locator('.nc-credit')).toContainText('dev@attv.uk');
    await expect(app.locator('.nc-credit')).toContainText("Tomasz 'Amigo' Lewandowski");
  });
});
