import AxeBuilder from '@axe-core/playwright';
import { test, expect, goToRoute, resetStorage } from './fixtures';
import type { Page } from '@playwright/test';

/** WCAG 2.1 A and AA, which is what the store listing claims. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function audit(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(' ')),
  }));
}

test.describe('accessibility', () => {
  test.beforeEach(async ({ app }) => {
    await resetStorage(app);
  });

  test('the calculator has no WCAG A/AA violations', async ({ app }) => {
    await goToRoute(app, '/calc');
    await app.getByLabel('IP address or CIDR block').fill('10.20.0.0/16');
    expect(await audit(app)).toEqual([]);
  });

  test('the projects view has no WCAG A/AA violations', async ({ app }) => {
    await goToRoute(app, '/projects');
    expect(await audit(app)).toEqual([]);
  });

  test('the planner has no WCAG A/AA violations', async ({ app }) => {
    await goToRoute(app, '/projects');
    await app.getByLabel('Project name').fill('Audit');
    await app.getByRole('button', { name: 'New project' }).click();
    await app.getByLabel('Add a root block').fill('10.20.0.0/16');
    await app.getByRole('button', { name: 'Add block' }).click();
    await app.locator('.nc-tree__item').first().getByRole('button', { name: 'Split', exact: true }).click();
    expect(await audit(app)).toEqual([]);
  });

  test('the tools page has no WCAG A/AA violations', async ({ app }) => {
    await goToRoute(app, '/tools');
    await app.locator('#nc-converter').getByLabel('Value', { exact: true }).fill('192.168.1.1');
    expect(await audit(app)).toEqual([]);
  });

  test('the VLSM solver has no WCAG A/AA violations', async ({ app }) => {
    await goToRoute(app, '/vlsm');
    await app.getByLabel('Base network').fill('192.168.10.0/24');
    await app.getByLabel('Name 1').fill('Office');
    await app.getByLabel('Hosts 1').fill('50');
    expect(await audit(app)).toEqual([]);
  });

  test('the conflict checker has no WCAG A/AA violations', async ({ app }) => {
    await goToRoute(app, '/conflicts');
    await app.getByLabel('Blocks, one per line').fill('10.0.0.0/8\n10.1.0.0/16');
    expect(await audit(app)).toEqual([]);
  });

  test('settings has no WCAG A/AA violations, light and dark', async ({ app }) => {
    await goToRoute(app, '/settings');
    expect(await audit(app)).toEqual([]);
    await app.getByRole('radio', { name: 'Dark' }).check();
    expect(await audit(app)).toEqual([]);
  });

  test('the popup has no WCAG A/AA violations', async ({ context, extensionId }) => {
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 380, height: 600 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByLabel('IP address or CIDR block').fill('192.168.1.0/24');
    expect(await audit(popup)).toEqual([]);
    await popup.close();
  });

  test('every nav link is reachable and marks the current page', async ({ app }) => {
    for (const [label, heading] of [
      ['Calculator', 'Quick calculator'],
      ['Projects', 'Projects'],
      ['VLSM solver', 'VLSM solver'],
      ['Conflicts', 'Conflict checker'],
      ['Settings', 'Settings'],
    ]) {
      await app.getByRole('link', { name: label as string }).click();
      await expect(app.getByRole('heading', { level: 1 })).toHaveText(heading as string);
      await expect(app.getByRole('link', { name: label as string })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
  });

  test('the calculator input takes focus on load', async ({ app }) => {
    await goToRoute(app, '/calc');
    await app.reload();
    await expect(app.getByLabel('IP address or CIDR block')).toBeFocused();
  });

  test('respects a reduced-motion preference', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`chrome-extension://${extensionId}/app.html#/calc`);
    await expect(page.locator('.nc-shell')).toBeVisible();
    await page.close();
  });

  test('follows the system colour scheme when the theme is auto', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`chrome-extension://${extensionId}/app.html#/calc`);
    // `auto` means no attribute at all, so the `prefers-color-scheme` rules take over.
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.emulateMedia({ colorScheme: 'light' });
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).not.toBe(light);
    await page.close();
  });
});
