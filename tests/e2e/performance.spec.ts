import { test, expect, goToRoute, resetStorage } from './fixtures';

/**
 * The numbers the store listing and the spec claim out loud. If one of these regresses the
 * listing becomes untrue, so they are asserted rather than assumed.
 */
test.describe('performance claims', () => {
  test.beforeEach(async ({ app }) => {
    await resetStorage(app);
  });

  test('checks a thousand blocks in well under a second (NFR-PERF-02)', async ({ app }) => {
    await goToRoute(app, '/conflicts');
    const lines = Array.from({ length: 1000 }, (_, index) => {
      const second = Math.floor(index / 4);
      const third = (index % 4) * 64;
      return `10.${second}.${third}.0/18`;
    }).join('\n');

    const elapsed = await app.evaluate(async (text) => {
      const box = document.querySelector('textarea') as HTMLTextAreaElement;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!;
      const started = performance.now();
      setter.call(box, text);
      box.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      return performance.now() - started;
    }, lines);

    await expect(app.getByRole('status')).toContainText('No overlaps found across 1000 blocks.');
    expect(elapsed).toBeLessThan(1000);
  });

  test('carves a root to the 1024-leaf ceiling and stays usable (FR-PLAN-04)', async ({ app }) => {
    await goToRoute(app, '/projects');
    await app.getByLabel('Project name').fill('Ceiling');
    await app.getByRole('button', { name: 'New project' }).click();
    await app.getByLabel('Add a root block').fill('10.0.0.0/16');
    await app.getByRole('button', { name: 'Add block' }).click();

    const started = Date.now();
    await app.locator('.nc-tree__item').first().getByRole('button', { name: 'Split to…' }).click();
    await app.getByLabel('Target prefix').fill('26');
    await app.getByRole('button', { name: 'Carve' }).click();

    // 1024 leaves plus every level above them: 2047 rows.
    await expect(app.locator('.nc-tree__item')).toHaveCount(2047, { timeout: 30_000 });
    expect(Date.now() - started).toBeLessThan(30_000);

    // The plan still saves, and reopening it brings the whole tree back.
    await expect(app.locator('.nc-save')).toHaveText('All changes saved');
    await app.reload();
    await expect(app.locator('.nc-tree__item')).toHaveCount(2047, { timeout: 30_000 });
  });

  test('refuses to go one leaf past the ceiling', async ({ app }) => {
    await goToRoute(app, '/projects');
    await app.getByLabel('Project name').fill('Over the ceiling');
    await app.getByRole('button', { name: 'New project' }).click();
    await app.getByLabel('Add a root block').fill('10.0.0.0/16');
    await app.getByRole('button', { name: 'Add block' }).click();

    await app.locator('.nc-tree__item').first().getByRole('button', { name: 'Split to…' }).click();
    await app.getByLabel('Target prefix').fill('27');
    await app.getByRole('button', { name: 'Carve' }).click();

    await expect(app.getByRole('alert')).toContainText('NetCarve stops at 1,024');
    await expect(app.locator('.nc-tree__item')).toHaveCount(1);
  });
});
