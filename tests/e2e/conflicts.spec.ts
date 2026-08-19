import { test, expect, goToRoute, readClipboard, resetStorage } from './fixtures';
import type { Page } from '@playwright/test';

const box = (page: Page) => page.getByLabel('Blocks, one per line');

test.describe('the conflict checker (F5)', () => {
  test.beforeEach(async ({ app }) => {
    await resetStorage(app);
    await goToRoute(app, '/conflicts');
  });

  test('says there is nothing to check yet', async ({ app }) => {
    await expect(app.locator('.nc-empty')).toHaveText('Nothing to check yet.');
  });

  test('passes a clean list', async ({ app }) => {
    await box(app).fill('10.0.0.0/24\n10.0.1.0/24\n192.168.0.0/16');
    await expect(app.getByRole('status')).toHaveText('No overlaps found across 3 blocks.');
  });

  test('groups identical blocks by the lines they came from', async ({ app }) => {
    await box(app).fill('10.0.0.0/8\n172.16.0.0/12\n10.0.0.0/8');
    const identical = app.locator('.nc-findings').first();
    await expect(identical).toContainText('10.0.0.0/8');
    await expect(identical).toContainText('lines 1, 3');
  });

  test('reports containment as a chain', async ({ app }) => {
    await box(app).fill('10.0.0.0/8\n10.1.0.0/16\n10.1.2.0/24');
    const chain = app.locator('.nc-findings li').last();
    await expect(chain).toContainText('10.0.0.0/8');
    await expect(chain).toContainText('10.1.0.0/16');
    await expect(chain).toContainText('10.1.2.0/24');
    await expect(app.locator('.nc-panel').last()).toContainText(
      'a partial overlap is arithmetically impossible',
    );
  });

  test('never crosses IPv4 with IPv6', async ({ app }) => {
    await box(app).fill('10.0.0.0/8\n2001:db8::/32\n2001:db8:1::/48');
    await expect(app.locator('.nc-findings')).toContainText('2001:db8::/32');
    await expect(app.locator('.nc-findings')).not.toContainText('10.0.0.0/8');
  });

  test('skips comments and blank lines but names bad ones', async ({ app }) => {
    await box(app).fill('10.0.0.0/8  # head office\n\n300.0.0.0/8\n10.0.0.0/8');
    await expect(app.locator('.nc-findings--errors')).toContainText('Line 3');
    await expect(app.locator('.nc-findings--errors')).toContainText('300.0.0.0/8');
    await expect(app.locator('.nc-label').filter({ hasText: 'skipped' })).toContainText(
      '1 line was skipped.',
    );
  });

  test('exports the report as Markdown', async ({ app }) => {
    await box(app).fill('10.0.0.0/8\n10.1.0.0/16');
    await app.getByRole('button', { name: 'Copy as Markdown' }).click();
    const copied = await readClipboard(app);
    expect(copied).toContain('10.0.0.0/8');
    expect(copied).toContain('10.1.0.0/16');
  });
});
