import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, goToRoute } from '../e2e/fixtures';
import { ACME } from './seed';
import type { Page } from '@playwright/test';

/**
 * Chrome Web Store assets, captured from the **full-page app** rather than the popup.
 *
 * The dashboard accepts at most five screenshots, so `screenshots/` holds exactly five, each
 * showing a different job the extension does. Everything else worth showing goes to
 * `gallery/`, which only the README and the website use and which nothing caps.
 *
 * The store five carry a caption band: the app is 1280 px wide, exactly the screenshot width,
 * so insetting or framing it would shrink the interface. Instead the page is captured at
 * 1280 × 744 and composited under a 56 px band, which keeps every pixel of the UI at 1:1 while
 * still saying what the reader is looking at.
 */

const STORE = fileURLToPath(new URL('../../docs/store/screenshots/', import.meta.url));
const GALLERY = fileURLToPath(new URL('../../docs/store/gallery/', import.meta.url));
mkdirSync(STORE, { recursive: true });
mkdirSync(GALLERY, { recursive: true });

/** Chrome Web Store screenshots are 1280 × 800. */
const SHOT = { width: 1280, height: 800 } as const;
const BAND = 56;
/** What is left for the app once the caption band has taken its share. */
const STAGE = { width: SHOT.width, height: SHOT.height - BAND } as const;

const BRAND = {
  slate: '#0a1015',
  ink: '#dde6ec',
  soft: '#93a8b6',
  accent: '#3fbfd6',
};

interface Seed {
  theme?: 'light' | 'dark';
  projects?: readonly unknown[];
}

async function seed(page: Page, { theme = 'light', projects = [ACME] }: Seed = {}): Promise<void> {
  await page.evaluate(
    async ([stored, mode]) => {
      await chrome.storage.local.set({
        'netcarve:projects': stored,
        'netcarve:settings': {
          schemaVersion: 1,
          theme: mode,
          allowSlash31: false,
          exportFooter: true,
          defaultCopyFormat: 'markdown',
        },
      });
    },
    [projects, theme] as const,
  );
  await page.reload();
  await page.waitForSelector('.nc-shell');
}

/** Waits for fonts and any transition to settle, so a run is reproducible. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

/** Puts `selector` just below the top of the frame. */
async function scrollTo(page: Page, selector: string): Promise<void> {
  await page.evaluate((target) => {
    const element = document.querySelector(target);
    if (element === null) return;
    globalThis.scrollTo({ top: element.getBoundingClientRect().top + globalThis.scrollY - 16 });
  }, selector);
}

/** The composite page: the captured app under a caption band. */
function banded(shot: string, title: string, subtitle: string): string {
  return `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; }
  body { background: ${BRAND.slate}; }
  .band {
    height: ${BAND}px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 28px;
    box-sizing: border-box;
    background: ${BRAND.slate};
    color: ${BRAND.ink};
    font-family: ui-sans-serif, system-ui, 'Segoe UI', Roboto, sans-serif;
    border-bottom: 2px solid ${BRAND.accent};
  }
  .mark { font-weight: 700; letter-spacing: -0.01em; font-size: 15px; color: ${BRAND.accent}; }
  .rule { width: 1px; height: 20px; background: #24323d; }
  .title { font-weight: 600; font-size: 15px; }
  .sub { color: ${BRAND.soft}; font-size: 13px; }
  img { display: block; width: ${SHOT.width}px; height: ${STAGE.height}px; }
</style>
<div class="band">
  <span class="mark">NetCarve</span>
  <span class="rule"></span>
  <span class="title">${title}</span>
  <span class="sub">${subtitle}</span>
</div>
<img src="data:image/png;base64,${shot}" alt="">`;
}

/** Captures the current page and writes it under a caption band. */
async function toStore(
  page: Page,
  file: string,
  title: string,
  subtitle: string,
): Promise<void> {
  await settle(page);
  const shot = (await page.screenshot()).toString('base64');

  const canvas = await page.context().newPage();
  await canvas.setViewportSize(SHOT);
  await canvas.setContent(banded(shot, title, subtitle));
  await settle(canvas);
  await canvas.screenshot({ path: `${STORE}${file}` });
  await canvas.close();
}

test.describe('Chrome Web Store screenshots', () => {
  test.use({ viewport: STAGE });

  test('01 — the calculator', async ({ app }) => {
    await seed(app);
    await goToRoute(app, '/calc');
    await app.getByLabel('IP address or CIDR block').fill('192.168.1.37/24');
    await expect(app.locator('.nc-calc__network')).toHaveText('192.168.1.0');
    await expect(app.getByText('Private (RFC 1918)')).toBeVisible();
    await toStore(
      app,
      '01-calculator.png',
      'Quick calculator',
      'IPv4 and IPv6 — masks, ranges and reserved-range notes as you type',
    );
  });

  test('02 — the visual planner', async ({ app }) => {
    await seed(app);
    await goToRoute(app, `/planner/${ACME.id}`);
    await expect(app.locator('.nc-tree__item').first()).toBeVisible();
    await scrollTo(app, '.nc-planner__head');
    await toStore(
      app,
      '02-planner.png',
      'Visual planner',
      'Carve a block into named, colour-coded subnets and watch the utilisation fill',
    );
  });

  test('03 — the VLSM solver', async ({ app }) => {
    await seed(app);
    await goToRoute(app, '/vlsm');
    for (const [index, [name, hosts]] of (
      [
        ['Warehouse', 120],
        ['Office', 60],
        ['VoIP handsets', 28],
        ['Management', 12],
      ] as const
    ).entries()) {
      if (index > 0) await app.getByRole('button', { name: 'Add requirement' }).click();
      await app.getByLabel(`Name ${index + 1}`).fill(name);
      await app.getByLabel(`Hosts ${index + 1}`).fill(String(hosts));
    }
    await app.getByLabel('Base network').fill('192.168.10.0/24');
    await expect(app.locator('.nc-table tbody tr')).toHaveCount(4);
    await scrollTo(app, '.nc-title');
    await toStore(
      app,
      '03-vlsm-solver.png',
      'VLSM solver',
      'Host counts in — an allocation in address order, with the waste each block leaves',
    );
  });

  test('04 — bases and bit mathematics', async ({ app }) => {
    await seed(app);
    await goToRoute(app, '/tools');
    await app.locator('#nc-converter').getByLabel('Value', { exact: true }).fill('192.168.1.37');
    await app.locator('#nc-bitwise').getByLabel('Operand A').fill('192.168.1.37');
    await app.locator('#nc-bitwise').getByLabel('Operand B').fill('255.255.255.0');
    await expect(app.locator('#nc-bitwise').getByLabel(/^Copy Result: 192\.168\.1\.0/)).toBeVisible();
    await scrollTo(app, '#nc-converter');
    await toStore(
      app,
      '04-tools.png',
      'Bases and bit mathematics',
      'DEC, HEX and BIN at a width you choose — and a bit field you can click',
    );
  });

  test('05 — the conflict checker, in the dark theme', async ({ app }) => {
    await seed(app, { theme: 'dark' });
    await goToRoute(app, '/conflicts');
    await app
      .getByLabel('Blocks, one per line')
      .fill(
        [
          '10.0.0.0/8            # inherited core',
          '10.20.0.0/16          # head office',
          '10.20.32.0/20         # guest wi-fi',
          '172.16.0.0/12',
          '192.168.0.0/16        # branch default',
          '192.168.0.0/16        # duplicated in the VPN config',
          '2001:db8::/32',
          '2001:db8:1000::/36',
        ].join('\n'),
      );
    await expect(app.locator('.nc-findings').first()).toBeVisible();
    await scrollTo(app, '.nc-title');
    await toStore(
      app,
      '05-conflict-checker.png',
      'Conflict checker',
      'Duplicates and containment chains, before a merger or a site-to-site VPN',
    );
  });
});

/**
 * The wider gallery. Not part of the listing — the store takes five — but the README and the
 * site can show as many as they like, so the scenarios that did not make the cut live here.
 */
test.describe('Gallery', () => {
  test.use({ viewport: SHOT });

  test('the popup, at its real size', async ({ context, extensionId }) => {
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 400, height: 600 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByLabel('IP address or CIDR block').fill('10.20.0.0 255.255.0.0');
    await expect(popup.locator('.nc-calc__network')).toHaveText('10.20.0.0');
    await settle(popup);
    await popup.screenshot({ path: `${GALLERY}popup-calculator.png` });
    await popup.close();
  });

  test('the calculator on IPv6', async ({ app }) => {
    await seed(app);
    await goToRoute(app, '/calc');
    await app.getByLabel('IP address or CIDR block').fill('2001:db8:1000::1/48');
    await expect(app.getByText('Canonical form')).toBeVisible();
    await settle(app);
    await app.screenshot({ path: `${GALLERY}calculator-ipv6.png` });
  });

  test('the projects list', async ({ app }) => {
    await seed(app);
    await goToRoute(app, '/projects');
    await expect(app.getByRole('heading', { name: 'Head office refresh' })).toBeVisible();
    await settle(app);
    await app.screenshot({ path: `${GALLERY}projects.png` });
  });

  test('the planner in the dark theme', async ({ app }) => {
    await seed(app, { theme: 'dark' });
    await goToRoute(app, `/planner/${ACME.id}`);
    await expect(app.locator('.nc-tree__item').first()).toBeVisible();
    await scrollTo(app, '.nc-planner__head');
    await settle(app);
    await app.screenshot({ path: `${GALLERY}planner-dark.png` });
  });

  test('the tools page in the dark theme', async ({ app }) => {
    await seed(app, { theme: 'dark' });
    await goToRoute(app, '/tools');
    await app.locator('#nc-converter').getByLabel('Value', { exact: true }).fill('255.255.248.0');
    await expect(app.locator('#nc-converter').getByLabel(/^Copy Hexadecimal:/)).toBeVisible();
    await scrollTo(app, '#nc-converter');
    await settle(app);
    await app.screenshot({ path: `${GALLERY}tools-dark.png` });
  });

  test('settings, and what the extension stores', async ({ app }) => {
    await seed(app);
    await goToRoute(app, '/settings');
    await expect(app.getByRole('heading', { name: 'Settings' })).toBeVisible();
    // About sits at the bottom of a long page; scroll so the release links are in frame.
    await scrollTo(app, '.nc-danger-zone');
    await settle(app);
    await app.screenshot({ path: `${GALLERY}settings.png` });
  });
});
