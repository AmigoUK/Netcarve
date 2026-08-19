import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, goToRoute } from '../e2e/fixtures';
import { ACME } from './seed';
import type { Page } from '@playwright/test';

const OUT = fileURLToPath(new URL('../../docs/store/screenshots/', import.meta.url));
mkdirSync(OUT, { recursive: true });

/** Chrome Web Store screenshots are 1280 × 800. */
const SHOT = { width: 1280, height: 800 } as const;

async function seed(page: Page, theme: 'light' | 'dark' = 'light'): Promise<void> {
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

/** Waits for fonts and any transition to settle so shots are reproducible. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

test.use({ viewport: SHOT });

test.describe('Chrome Web Store screenshots', () => {
  test('01 — the popup calculator, on a branded canvas', async ({ context, extensionId }) => {
    const popup = await context.newPage();
    // Chrome caps a popup at 400 × 600, which is exactly what the card measures — so the
    // capture is the real thing at its real size.
    await popup.setViewportSize({ width: 400, height: 600 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByLabel('IP address or CIDR block').fill('192.168.1.37 255.255.255.0');
    await expect(popup.locator('.nc-calc__network')).toHaveText('192.168.1.0');
    await settle(popup);
    const shot = (await popup.screenshot()).toString('base64');
    await popup.close();

    // The popup is 400 px wide; a raw capture would sit in a sea of white on a 1280 × 800
    // canvas, so it is composited onto the same drafting-paper background the app uses.
    const canvas = await context.newPage();
    await canvas.setViewportSize(SHOT);
    await canvas.setContent(heroPage(shot));
    await settle(canvas);
    await canvas.screenshot({ path: `${OUT}01-popup-calculator.png` });
    await canvas.close();
  });

  test('02 — the visual planner', async ({ app }) => {
    await seed(app);
    await goToRoute(app, `/planner/${ACME.id}`);
    await expect(app.locator('.nc-tree__item').first()).toBeVisible();
    await showTree(app);
    await settle(app);
    await app.screenshot({ path: `${OUT}02-planner.png` });
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
    await settle(app);
    await app.screenshot({ path: `${OUT}03-vlsm-solver.png` });
  });

  test('04 — the conflict checker', async ({ app }) => {
    await seed(app);
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
    await settle(app);
    await app.screenshot({ path: `${OUT}04-conflict-checker.png` });
  });

  test('05 — the planner in the dark theme', async ({ app }) => {
    await seed(app, 'dark');
    await goToRoute(app, `/planner/${ACME.id}`);
    await expect(app.locator('.nc-tree__item').first()).toBeVisible();
    await showTree(app);
    await settle(app);
    await app.screenshot({ path: `${OUT}05-planner-dark.png` });
  });
});

/** Scrolls so the whole plan tree is in frame rather than half of it. */
async function showTree(page: Page): Promise<void> {
  await scrollTo(page, '.nc-planner__head');
}

/** Puts `selector` just below the top of the frame. */
async function scrollTo(page: Page, selector: string): Promise<void> {
  await page.evaluate((target) => {
    const element = document.querySelector(target);
    if (element === null) return;
    globalThis.scrollTo({ top: element.getBoundingClientRect().top + globalThis.scrollY - 20 });
  }, selector);
}

/** The 1280 × 800 canvas the popup capture is dropped onto. */
function heroPage(popupPng: string): string {
  return `<!doctype html>
<meta charset="utf-8">
<style>
  :root { color-scheme: light; }
  html, body { margin: 0; height: 100%; }
  body {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 64px;
    padding: 0 88px;
    box-sizing: border-box;
    background:
      repeating-linear-gradient(0deg, rgba(11,110,131,.06) 0 1px, transparent 1px 40px),
      repeating-linear-gradient(90deg, rgba(11,110,131,.06) 0 1px, transparent 1px 40px),
      #eaeef3;
    font-family: ui-sans-serif, system-ui, 'Segoe UI', Roboto, sans-serif;
    color: #0d1b26;
  }
  h1 { font-size: 54px; line-height: 1.05; margin: 0 0 18px; letter-spacing: -0.02em; }
  p  { font-size: 21px; line-height: 1.5; margin: 0 0 26px; color: #4d6070; max-width: 30ch; }
  ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
  li { font-size: 17px; color: #0d1b26; display: flex; align-items: center; gap: 12px; }
  li::before {
    content: ''; width: 10px; height: 10px; border-radius: 2px; background: #0b6e83;
  }
  .shot {
    border: 1px solid #c8d3dd; border-radius: 10px; overflow: hidden;
    box-shadow: 0 24px 60px rgba(13,27,38,.18); display: block;
  }
  .shot img { display: block; width: 400px; }
</style>
<div>
  <h1>Right‑click an address.<br>Get the whole picture.</h1>
  <p>The quick calculator lives in the toolbar — IPv4 and IPv6, masks, ranges and reserved‑range notes as you type.</p>
  <ul>
    <li>Bit ruler showing where the network bits stop</li>
    <li>RFC 1918, CGNAT and documentation blocks flagged</li>
    <li>Click any value to copy it</li>
  </ul>
</div>
<div class="shot"><img src="data:image/png;base64,${popupPng}" alt=""></div>`;
}
