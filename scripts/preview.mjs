#!/usr/bin/env node
/**
 * Renders every view, in both themes, into `.output/preview/`.
 *
 * This exists because three layout defects reached a release before anyone looked at the
 * pixels: DOM tests assert what the markup says, and `tests/e2e/layout.spec.ts` now measures
 * what overflows, but neither notices a row that is merely *ugly*. That still takes an eye —
 * so this makes looking a single command rather than a chore nobody does.
 *
 *   npm run preview            every view, light and dark
 *   npm run preview -- tools   only the views whose name matches
 */
import { chromium } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION = fileURLToPath(new URL('../.output/chrome-mv3', import.meta.url));
const OUT = fileURLToPath(new URL('../.output/preview', import.meta.url));
const filter = process.argv[2];

/** A seeded plan, so the planner and projects views are not empty. */
const PROJECT = {
  schemaVersion: 1,
  id: 'preview-0001',
  name: 'Head office refresh',
  client: 'Acme Ltd',
  createdAt: 1_750_000_000_000,
  updatedAt: 1_750_000_000_000,
  roots: [
    {
      cidr: '10.20.0.0/16',
      children: [
        {
          cidr: '10.20.0.0/17',
          children: [
            { cidr: '10.20.0.0/18', name: 'VLAN 10 — Office', vlanId: 10, colour: 'blue' },
            { cidr: '10.20.64.0/18', name: 'VLAN 20 — Voice', vlanId: 20, colour: 'teal' },
          ],
        },
        { cidr: '10.20.128.0/17' },
      ],
    },
  ],
};

const VIEWS = [
  { name: 'calc', route: '/calc', fill: [['IP address or CIDR block', '192.168.1.37/24']] },
  { name: 'calc-ipv6', route: '/calc', fill: [['IP address or CIDR block', '2001:db8:1000::1/48']] },
  { name: 'calc-error', route: '/calc', fill: [['IP address or CIDR block', '999.1.1.1']] },
  { name: 'projects', route: '/projects', fill: [] },
  { name: 'planner', route: `/planner/${PROJECT.id}`, fill: [] },
  { name: 'vlsm', route: '/vlsm', fill: [['Base network', '192.168.10.0/24'], ['Hosts 1', '120']] },
  { name: 'conflicts', route: '/conflicts', fill: [['Blocks, one per line', '10.0.0.0/8\n10.1.0.0/16\n10.1.0.0/16']] },
  { name: 'tools', route: '/tools', fill: [] },
  { name: 'settings', route: '/settings', fill: [] },
];

await mkdir(OUT, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'netcarve-preview-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  channel: 'chromium',
  viewport: { width: 1280, height: 900 },
  args: [
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
    '--no-first-run',
    '--hide-scrollbars',
  ],
});

const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const id = new URL(worker.url()).host;
const page = await context.newPage();
let written = 0;

for (const theme of ['light', 'dark']) {
  for (const view of VIEWS) {
    if (filter !== undefined && !view.name.includes(filter)) continue;

    await page.goto(`chrome-extension://${id}/app.html#${view.route}`);
    await page.waitForSelector('.nc-shell');
    await page.evaluate(
      async ([project, mode]) => {
        await chrome.storage.local.set({
          'netcarve:projects': [project],
          'netcarve:settings': {
            schemaVersion: 1,
            theme: mode,
            allowSlash31: false,
            exportFooter: true,
            defaultCopyFormat: 'markdown',
          },
        });
      },
      [PROJECT, theme],
    );
    await page.reload();
    await page.waitForSelector('.nc-shell');

    for (const [label, value] of view.fill) {
      await page.getByLabel(label, { exact: true }).first().fill(value);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);

    const file = join(OUT, `${view.name}-${theme}.png`);
    await page.screenshot({ path: file, fullPage: true });
    written += 1;
    console.log(`  ${view.name.padEnd(12)} ${theme.padEnd(5)} → ${file}`);
  }
}

// The popup is a fixed 400 px and is where crowding shows up first.
if (filter === undefined || 'popup'.includes(filter)) {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 400, height: 600 });
  for (const value of ['192.168.1.37/24', '2001:db8:1000::1/48']) {
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.getByLabel('IP address or CIDR block').fill(value);
    await popup.waitForTimeout(250);
    const file = join(OUT, `popup-${value.includes(':') ? 'ipv6' : 'ipv4'}.png`);
    await popup.screenshot({ path: file, fullPage: true });
    written += 1;
    console.log(`  popup        ${value.includes(':') ? 'ipv6' : 'ipv4'}  → ${file}`);
  }
  await popup.close();
}

await context.close();
await rm(profile, { recursive: true, force: true });
console.log(`\n${written} renders in ${OUT} — open them before calling the change done.`);
