import { test, expect, goToRoute } from './fixtures';
import { MENU_ID } from '../../src/lib/menu';

test.describe('the context-menu integration (F6)', () => {
  test('registers exactly one "Analyse …" item on install', async ({ background }) => {
    // `onInstalled` may not have run by the time the worker is first reachable, so wait for
    // the item to exist — `update` reports a missing id and is otherwise a no-op here.
    await expect
      .poll(async () =>
        background.evaluate(
          (id) =>
            new Promise<string>((resolve) => {
              chrome.contextMenus.update(id, { contexts: ['selection'] }, () =>
                resolve(chrome.runtime.lastError?.message ?? 'ok'),
              );
            }),
          MENU_ID,
        ),
      )
      .toBe('ok');

    // There is no API to list items, but re-creating one is rejected as a duplicate — which
    // is proof there is exactly one.
    const error = await background.evaluate(
      (id) =>
        new Promise<string | undefined>((resolve) => {
          chrome.contextMenus.create(
            { id, title: 'duplicate probe', contexts: ['selection'] },
            () => resolve(chrome.runtime.lastError?.message),
          );
        }),
      MENU_ID,
    );
    expect(error).toContain('duplicate id');
    expect(error).toContain(MENU_ID);
  });

  test('opens the calculator prefilled from a selection (FR-CTX-02)', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(
      `chrome-extension://${extensionId}/app.html#/calc?q=${encodeURIComponent('10.8.0.0/21')}`,
    );
    await expect(page.getByLabel('IP address or CIDR block')).toHaveValue('10.8.0.0/21');
    await expect(page.locator('.nc-calc__network')).toHaveText('10.8.0.0');
    await page.close();
  });

  test('wipes the query so a refresh does not re-trigger it (FR-CTX-04)', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/app.html#/calc?q=192.0.2.1`);
    await expect(page.getByLabel('IP address or CIDR block')).toHaveValue('192.0.2.1');
    await expect(page).toHaveURL(/#\/calc$/);

    await page.reload();
    await expect(page.getByLabel('IP address or CIDR block')).toHaveValue('');
    await page.close();
  });

  test('shows a friendly error when the selection was not an address (FR-CTX-03)', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(
      `chrome-extension://${extensionId}/app.html#/calc?q=${encodeURIComponent('the wifi is down')}`,
    );
    await expect(page.getByRole('alert')).toContainText(
      'That does not look like an IPv4 or IPv6 address.',
    );
    await page.close();
  });

  test('falls back to the calculator for an unknown route', async ({ app }) => {
    await goToRoute(app, '/nowhere');
    await expect(app.getByRole('heading', { level: 1 })).toHaveText('Quick calculator');
  });
});
