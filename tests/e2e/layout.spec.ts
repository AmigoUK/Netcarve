import { test, expect, goToRoute, resetStorage } from './fixtures';
import { ACME } from '../store/seed';
import type { Page } from '@playwright/test';

/**
 * Layout invariants: nothing spills out of the box it was given.
 *
 * Three defects reached a release before a screenshot caught them by eye — the popup's bit
 * ruler overflowing 400 px, and a link wrapping across three lines beside it. Neither showed up
 * in the DOM tests, which assert what the markup *says* rather than what it *measures*, and
 * neither would have been caught by comparing screenshots against a baseline either: both were
 * wrong from their first commit, so the baseline would have enshrined the defect.
 *
 * What does catch them mechanically is measuring. These checks run over every route, both
 * themes and three window widths, and name the offending element when they fail.
 */

/** Window widths the full-page app is expected to survive. */
const WIDTHS = [1280, 1024, 768] as const;

const ROUTES = [
  { path: '/calc', settle: '.nc-calc' },
  { path: '/projects', settle: '.nc-cards, .nc-empty' },
  { path: `/planner/${ACME.id}`, settle: '.nc-tree' },
  { path: '/vlsm', settle: '.nc-requirements' },
  { path: '/conflicts', settle: '.nc-textarea' },
  { path: '/tools', settle: '#nc-masks' },
  { path: '/settings', settle: '.nc-danger-zone' },
] as const;

/**
 * Elements that overflow horizontally.
 *
 * `allowScrollable` is the difference between the app and the popup. A wide table inside
 * `overflow-x: auto` is a deliberate choice in a resizable tab; in a popup pinned at 400 px it
 * is a half-visible column the user cannot reach without a horizontal scroll they will never
 * think to try.
 */
async function overflowing(page: Page, allowScrollable: boolean): Promise<string[]> {
  return page.evaluate((allow) => {
    const describe = (element: Element): string => {
      const classes = element.className.toString().trim().split(/\s+/).filter(Boolean).slice(0, 2);
      return `${element.tagName.toLowerCase()}${classes.map((name) => `.${name}`).join('')}`;
    };

    const found: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth + 1) {
      found.push(`document (${root.scrollWidth} > ${root.clientWidth})`);
    }

    for (const element of Array.from(document.querySelectorAll('body *'))) {
      // A form control scrolls its own text; that is the control working, not a layout fault.
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) continue;
      // Hidden or unrendered elements measure as overflowing everything.
      if (element.clientWidth === 0) continue;
      // A visually-hidden label is deliberately clipped to a pixel; that is the technique
      // working, not a layout fault.
      if (globalThis.getComputedStyle(element).clipPath !== 'none') continue;
      if (element.scrollWidth <= element.clientWidth + 1) continue;

      const overflowX = globalThis.getComputedStyle(element).overflowX;
      const scrollable = overflowX === 'auto' || overflowX === 'scroll';
      if (scrollable && allow) continue;

      found.push(`${describe(element)} (${element.scrollWidth} > ${element.clientWidth})`);
    }
    return found;
  }, allowScrollable);
}

async function seed(page: Page, theme: 'light' | 'dark'): Promise<void> {
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
    [ACME, theme] as const,
  );
  await page.reload();
  await page.waitForSelector('.nc-shell');
}

test.describe('layout invariants', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of WIDTHS) {
      test(`nothing overflows at ${width} px in the ${theme} theme`, async ({ app }) => {
        await app.setViewportSize({ width, height: 900 });
        await seed(app, theme);

        const faults: string[] = [];
        for (const route of ROUTES) {
          await goToRoute(app, route.path);
          await app.waitForSelector(route.settle);
          // Give every view something to lay out, not just an empty state.
          if (route.path === '/calc') {
            await app.getByLabel('IP address or CIDR block').fill('2001:db8:1000::1/48');
          }
          if (route.path === '/tools') {
            await app.locator('#nc-converter').getByLabel('Value', { exact: true }).fill('2001:db8::1');
          }
          if (route.path === '/conflicts') {
            await app.getByLabel('Blocks, one per line').fill('10.0.0.0/8\n10.1.0.0/16');
          }
          await app.waitForTimeout(150);

          for (const fault of await overflowing(app, true)) {
            faults.push(`${route.path} — ${fault}`);
          }
        }

        expect(faults, faults.join('\n')).toEqual([]);
      });
    }
  }
});

test.describe('the popup is pinned at 400 px', () => {
  /**
   * Chrome caps a popup at 400 px and gives the user no comfortable way to scroll sideways, so
   * here even a deliberately scrollable container counts as a fault: whatever it holds has to
   * fit, or it is invisible in practice.
   */
  const CASES = [
    { label: 'an IPv4 block', value: '192.168.1.37/24' },
    { label: 'an address and mask', value: '10.20.0.0 255.255.0.0' },
    { label: 'an IPv6 block', value: '2001:db8:1000::1/48' },
    { label: 'a parse error', value: 'C0A8' },
  ];

  for (const { label, value } of CASES) {
    test(`fits ${label}`, async ({ context, extensionId, app }) => {
      await resetStorage(app);
      const popup = await context.newPage();
      await popup.setViewportSize({ width: 400, height: 600 });
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await popup.getByLabel('IP address or CIDR block').fill(value);
      await popup.waitForTimeout(250);

      const faults = await overflowing(popup, false);
      expect(faults, faults.join('\n')).toEqual([]);
      await popup.close();
    });
  }
});
