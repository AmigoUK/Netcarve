import { test, expect } from './fixtures';

test.describe('the toolbar popup', () => {
  test('calculates in the compact layout', async ({ context, extensionId }) => {
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 380, height: 600 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(popup.locator('.nc-calc--compact')).toBeVisible();
    await popup.getByLabel('IP address or CIDR block').fill('192.168.1.0/24');
    await expect(popup.locator('.nc-calc__network')).toHaveText('192.168.1.0');
    await expect(popup.getByRole('button', { name: /^Copy Subnet mask:/ })).toHaveText(
      /255\.255\.255\.0/,
    );
    await popup.close();
  });

  test('restores the last input it was given (FR-CALC-07)', async ({ context, extensionId }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByLabel('IP address or CIDR block').fill('172.16.4.0/22');
    // The writer debounces at 500 ms; wait for the value to actually land.
    await expect
      .poll(async () =>
        popup.evaluate(async () => (await chrome.storage.local.get('netcarve:calcLast'))['netcarve:calcLast']),
      )
      .toBe('172.16.4.0/22');
    await popup.close();

    const reopened = await context.newPage();
    await reopened.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(reopened.getByLabel('IP address or CIDR block')).toHaveValue('172.16.4.0/22');
    await reopened.close();
  });

  test('hands the current input to the full app (FR-CALC-08)', async ({ context, extensionId }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByLabel('IP address or CIDR block').fill('10.44.0.0/14');

    const opened = context.waitForEvent('page');
    await popup.getByRole('button', { name: /Open the full app/ }).click();
    const app = await opened;

    // The app consumes `?q` and rewrites the URL, so by the time it has settled the query is
    // gone and the value is in the box.
    await expect(app.getByLabel('IP address or CIDR block')).toHaveValue('10.44.0.0/14');
    await expect(app).toHaveURL(/app\.html#\/calc$/);
    await expect(app.locator('.nc-calc__network')).toHaveText('10.44.0.0');
    await popup.close();
    await app.close();
  });

  test('carries no credit footer — the app route does that instead', async ({
    context,
    extensionId,
  }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator('.nc-credit')).toHaveCount(0);
    await popup.close();
  });
});
