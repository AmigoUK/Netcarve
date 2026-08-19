import { test, expect, goToRoute, resetStorage } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * The failure paths a user can actually hit: a storage write that is refused, and a stored
 * plan that has been corrupted. Neither can be reached by clicking, so both are injected.
 */
test.describe('resilience', () => {
  test('keeps working and says so when a storage write is refused (FR-STOR-02)', async ({
    app,
  }) => {
    await resetStorage(app);
    await goToRoute(app, '/projects');
    await app.getByLabel('Project name').fill('Quota');
    await app.getByRole('button', { name: 'New project' }).click();

    // From here on every write fails, exactly as it would over quota.
    await app.evaluate(() => {
      chrome.storage.local.set = () => Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
    });

    await app.getByLabel('Add a root block').fill('10.20.0.0/16');
    await app.getByRole('button', { name: 'Add block' }).click();

    await expect(app.locator('.nc-save--error')).toContainText(
      'Could not save — your work is still here, but only until you close this tab.',
    );
    // The work itself is still on screen and still editable.
    await expect(app.locator('.nc-tree__item')).toHaveCount(1);
    await app.locator('.nc-tree__item').first().getByRole('button', { name: 'Split', exact: true }).click();
    await expect(app.locator('.nc-tree__item')).toHaveCount(3);
  });

  test('quarantines a corrupt root rather than losing the project', async ({ app }) => {
    await seedCorruptProject(app);

    await expect(app.locator('.nc-toast--error')).toContainText('could not be read and were set aside');
    await expect(app.locator('.nc-toast--error')).toContainText('10.20.0.0/16');

    // The healthy root in the same project survived.
    await goToRoute(app, '/projects');
    const card = app.locator('.nc-card').filter({ hasText: 'Damaged' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('192.168.0.0/16');
  });

  test('ignores a settings blob it cannot understand', async ({ app }) => {
    await app.evaluate(async () => {
      await chrome.storage.local.set({ 'netcarve:settings': { theme: 'chartreuse', nonsense: 1 } });
    });
    await app.reload();
    await app.waitForSelector('.nc-shell');
    await goToRoute(app, '/settings');

    await expect(app.getByRole('radio', { name: 'Match the system' })).toBeChecked();
    await expect(app.getByLabel('Add a NetCarve credit line to exports')).toBeChecked();
  });
});

/** A project whose first root has children that are not its two halves. */
async function seedCorruptProject(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      'netcarve:projects': [
        {
          schemaVersion: 1,
          id: 'c0rrupt00-0000-4000-8000-000000000001',
          name: 'Damaged',
          createdAt: 1_750_000_000_000,
          updatedAt: 1_750_000_000_000,
          roots: [
            {
              cidr: '10.20.0.0/16',
              children: [{ cidr: '10.20.0.0/17' }, { cidr: '10.99.0.0/17' }],
            },
            { cidr: '192.168.0.0/16' },
          ],
        },
      ],
    });
  });
  await page.reload();
  await page.waitForSelector('.nc-shell');
}
