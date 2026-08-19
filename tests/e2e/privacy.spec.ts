import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { test, expect, goToRoute, EXTENSION_PATH } from './fixtures';

/** Every file in the built extension, recursively. */
function bundleFiles(dir = EXTENSION_PATH): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? bundleFiles(path) : [path];
  });
}

const codeAndMarkup = bundleFiles().filter((path) => /\.(js|html|css|json)$/.test(path));

test.describe('privacy and packaging (NFR-PERM, NFR-PERF)', () => {
  test('no shipped file calls out to the network (NFR-PERM-02)', () => {
    const offenders: string[] = [];
    for (const path of codeAndMarkup) {
      const source = readFileSync(path, 'utf8');
      for (const pattern of [
        /\bfetch\s*\(/,
        /XMLHttpRequest/,
        /new\s+WebSocket/,
        /navigator\.sendBeacon/,
        /EventSource/,
        /import\s*\(\s*["']https?:/,
      ]) {
        if (pattern.test(source)) offenders.push(`${path}: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('references no remote asset (NFR-PERM-02)', () => {
    const offenders: string[] = [];
    for (const path of codeAndMarkup) {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/https?:\/\/[^"'\s)]+/g)) {
        // The credit footer's two links are the only outside URLs, and they are user-clicked.
        if (/^https?:\/\/(www\.attv\.uk|github\.com\/AmigoUK\/Netcarve)/.test(match[0])) continue;
        // XML namespace identifiers are never fetched — Preact passes them to createElementNS.
        if (match[0].startsWith('http://www.w3.org/')) continue;
        offenders.push(`${path}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('makes no request off the extension origin while every view is used', async ({
    app,
    context,
  }) => {
    const external: string[] = [];
    context.on('request', (request) => {
      if (!request.url().startsWith('chrome-extension://') && !request.url().startsWith('data:')) {
        external.push(request.url());
      }
    });

    await goToRoute(app, '/calc');
    await app.getByLabel('IP address or CIDR block').fill('10.20.0.0/16');
    await goToRoute(app, '/projects');
    await app.getByLabel('Project name').fill('Network audit');
    await app.getByRole('button', { name: 'New project' }).click();
    await app.getByLabel('Add a root block').fill('10.20.0.0/16');
    await app.getByRole('button', { name: 'Add block' }).click();
    await goToRoute(app, '/vlsm');
    await app.getByLabel('Base network').fill('192.168.10.0/24');
    await app.getByLabel('Name 1').fill('Office');
    await app.getByLabel('Hosts 1').fill('50');
    await goToRoute(app, '/conflicts');
    await app.getByLabel('Blocks, one per line').fill('10.0.0.0/8\n10.1.0.0/16');
    await goToRoute(app, '/settings');
    await app.waitForTimeout(500);

    expect(external).toEqual([]);
  });

  test('logs nothing to the console beyond what a clean run should', async ({
    context,
    extensionId,
  }) => {
    const noise: string[] = [];
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') noise.push(message.text());
    });
    page.on('pageerror', (error) => noise.push(error.message));

    await page.goto(`chrome-extension://${extensionId}/app.html#/calc`);
    await page.getByLabel('IP address or CIDR block').fill('2001:db8::/48');
    await page.waitForTimeout(500);
    await page.close();

    expect(noise).toEqual([]);
  });

  test('stays well under the 150 KB gzipped budget (NFR-PERF-03)', () => {
    const total = codeAndMarkup
      .filter((path) => /\.(js|css|html)$/.test(path))
      .reduce((sum, path) => sum + gzipSync(readFileSync(path)).byteLength, 0);
    expect(total).toBeLessThan(150 * 1024);
  });

  test('renders the first paint quickly (NFR-PERF-01)', async ({ context, extensionId }) => {
    const page = await context.newPage();
    const started = Date.now();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForSelector('.nc-calc');
    expect(Date.now() - started).toBeLessThan(1_000);
    await page.close();
  });
});
