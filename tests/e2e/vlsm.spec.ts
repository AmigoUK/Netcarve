import { test, expect, goToRoute, readClipboard, resetStorage } from './fixtures';
import type { Page } from '@playwright/test';

/** Fills requirement `index` (1-based, matching the visible labels). */
async function requirement(page: Page, index: number, name: string, hosts: number) {
  const rows = await page.getByLabel(/^Name \d+$/).count();
  if (index > rows) await page.getByRole('button', { name: 'Add requirement' }).click();
  await page.getByLabel(`Name ${index}`).fill(name);
  await page.getByLabel(`Hosts ${index}`).fill(String(hosts));
}

const allocation = (page: Page) => page.locator('.nc-table tbody tr');

test.describe('the VLSM solver (F4)', () => {
  test.beforeEach(async ({ app }) => {
    await resetStorage(app);
    await goToRoute(app, '/vlsm');
  });

  test('asks for a base network and a requirement first', async ({ app }) => {
    await expect(app.locator('.nc-empty')).toHaveText(
      'Add a base network and at least one requirement, then solve.',
    );
  });

  test('allocates largest-first and reports the waste', async ({ app }) => {
    await app.getByLabel('Base network').fill('192.168.10.0/24');
    await requirement(app, 1, 'Office', 50);
    await requirement(app, 2, 'Warehouse', 25);
    await requirement(app, 3, 'Wi-Fi', 10);

    await expect(allocation(app)).toHaveCount(3);
    const cells = await allocation(app).allInnerTexts();
    expect(cells[0]).toContain('Office');
    expect(cells[0]).toContain('192.168.10.0/26');
    expect(cells[1]).toContain('Warehouse');
    expect(cells[1]).toContain('192.168.10.64/27');
    expect(cells[2]).toContain('Wi-Fi');
    expect(cells[2]).toContain('192.168.10.96/28');

    await expect(app.locator('.nc-free')).toContainText('192.168.10.112/28');
    await expect(app.locator('.nc-hint').last()).toBeVisible();
  });

  test('keeps a requirement name beside its host count', async ({ app }) => {
    await app.getByLabel('Base network').fill('192.168.10.0/24');
    await requirement(app, 1, 'Warehouse', 120);

    const name = await app.getByLabel('Name 1').boundingBox();
    const hosts = await app.getByLabel('Hosts 1').boundingBox();
    const gap = hosts!.x - (name!.x + name!.width);

    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(40);
  });

  test('reports how far short the base network falls', async ({ app }) => {
    await app.getByLabel('Base network').fill('192.168.10.0/28');
    await requirement(app, 1, 'Too big', 200);

    await expect(app.getByRole('alert')).toContainText('does not fit');
    await expect(app.getByRole('alert')).toContainText('short');
  });

  test('refuses an IPv6 base network', async ({ app }) => {
    await app.getByLabel('Base network').fill('2001:db8::/64');
    await requirement(app, 1, 'Office', 50);
    await expect(app.getByRole('alert')).toContainText(
      'The solver works on IPv4 — host-count sizing is an IPv4 problem.',
    );
  });

  test('uses a /31 for a two-host link once the setting allows it', async ({ app }) => {
    await app.getByLabel('Base network').fill('192.168.10.0/24');
    await requirement(app, 1, 'Point-to-point', 2);
    await expect(allocation(app).first()).toContainText('192.168.10.0/30');

    await goToRoute(app, '/settings');
    await app.getByLabel('Allow /31 for two-host links').check();
    await goToRoute(app, '/vlsm');

    await app.getByLabel('Base network').fill('192.168.10.0/24');
    await requirement(app, 1, 'Point-to-point', 2);
    await expect(allocation(app).first()).toContainText('192.168.10.0/31');
    await expect(
      app.getByText('/31 links are enabled in Settings — two-host requirements use a /31.'),
    ).toBeVisible();
  });

  test('reorders and removes requirements', async ({ app }) => {
    await app.getByLabel('Base network').fill('192.168.10.0/24');
    await requirement(app, 1, 'Office', 50);
    await requirement(app, 2, 'Warehouse', 25);

    await app.getByRole('button', { name: 'Move down: Office' }).click();
    await expect(app.getByLabel('Name 1')).toHaveValue('Warehouse');

    await app.getByRole('button', { name: 'Remove Warehouse' }).click();
    await expect(app.getByLabel(/^Name \d+$/)).toHaveCount(1);
    await expect(allocation(app)).toHaveCount(1);
  });

  test('exports the allocation as Markdown and CSV', async ({ app }) => {
    await app.getByLabel('Base network').fill('192.168.10.0/24');
    await requirement(app, 1, 'Office', 50);

    await app.getByRole('button', { name: 'Copy as Markdown' }).click();
    const copied = await readClipboard(app);
    expect(copied).toContain('192.168.10.0/26');
    expect(copied).toContain('Office');

    const download = app.waitForEvent('download');
    await app.getByRole('button', { name: 'Download CSV' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('vlsm-192-168-10-0-24.csv');
  });

  test('sends a solution to a new project in the planner (FR-VLSM-06)', async ({ app }) => {
    await app.getByLabel('Base network').fill('192.168.10.0/24');
    await requirement(app, 1, 'Office', 50);
    await requirement(app, 2, 'Warehouse', 25);

    await app.getByRole('button', { name: 'Send to planner' }).click();

    await expect(app.getByRole('heading', { level: 1 })).toHaveText(
      'VLSM plan for 192.168.10.0/24',
    );
    await expect(app.locator('.nc-toast')).toContainText('Added to');
    await expect(app.locator('.nc-tree__name', { hasText: 'Office' })).toBeVisible();
    await expect(app.locator('.nc-tree__name', { hasText: 'Warehouse' })).toBeVisible();
  });

  test('adds a solution to an existing project when one is chosen', async ({ app }) => {
    await goToRoute(app, '/projects');
    await app.getByLabel('Project name').fill('Branch rollout');
    await app.getByRole('button', { name: 'New project' }).click();

    await goToRoute(app, '/vlsm');
    await app.getByLabel('Base network').fill('192.168.10.0/24');
    await requirement(app, 1, 'Office', 50);
    await app.getByLabel('Add to').selectOption({ label: 'Branch rollout' });
    await app.getByRole('button', { name: 'Send to planner' }).click();

    await expect(app.getByRole('heading', { level: 1 })).toHaveText('Branch rollout');
    await expect(app.locator('.nc-root__cidr')).toHaveText('192.168.10.0/24');
  });
});
