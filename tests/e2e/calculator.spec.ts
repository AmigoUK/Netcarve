import { test, expect, goToRoute, readClipboard } from './fixtures';
import type { Page } from '@playwright/test';

const input = (page: Page) => page.getByLabel('IP address or CIDR block');
const field = (page: Page, label: string) =>
  page.getByRole('button', { name: new RegExp(`^Copy ${label}:`) });

test.describe('the quick calculator (F1)', () => {
  test.beforeEach(async ({ app }) => {
    await goToRoute(app, '/calc');
  });

  test('starts empty and says what to do', async ({ app }) => {
    await expect(app.locator('.nc-empty')).toHaveText(
      'Type an address to see its network, range and reserved-range notes.',
    );
  });

  test('breaks an IPv4 block down field by field', async ({ app }) => {
    await input(app).fill('10.20.0.0/16');

    await expect(app.locator('.nc-calc__network')).toHaveText('10.20.0.0');
    await expect(app.locator('.nc-calc__prefix')).toHaveText('/16');
    await expect(app.locator('.nc-chip').first()).toHaveText('IPv4');

    await expect(field(app, 'Subnet mask')).toHaveText(/255\.255\.0\.0/);
    await expect(field(app, 'Wildcard mask')).toHaveText(/0\.0\.255\.255/);
    await expect(field(app, 'Broadcast address')).toHaveText(/10\.20\.255\.255/);
    await expect(field(app, 'First usable')).toHaveText(/10\.20\.0\.1/);
    await expect(field(app, 'Last usable')).toHaveText(/10\.20\.255\.254/);
    await expect(field(app, 'Usable addresses')).toHaveText(/65,534/);
    await expect(field(app, 'Total addresses')).toHaveText(/65,536/);
  });

  test('rebases a host address onto its network and says so', async ({ app }) => {
    await input(app).fill('192.168.1.37 255.255.255.0');

    await expect(app.locator('.nc-calc__network')).toHaveText('192.168.1.0');
    await expect(app.locator('.nc-calc__prefix')).toHaveText('/24');
    await expect(app.locator('.nc-notes')).toContainText(
      'Input was a host address within this network.',
    );
  });

  test('handles IPv6, including the compressed and expanded forms', async ({ app }) => {
    await input(app).fill('2001:db8::/48');

    await expect(app.locator('.nc-chip').first()).toHaveText('IPv6');
    await expect(field(app, 'Canonical form')).toHaveText(/2001:db8::/);
    await expect(field(app, 'Full form')).toHaveText(/2001:0db8:0000:0000:0000:0000:0000:0000/);
    await expect(app.locator('.nc-notes')).toContainText('IPv6 has no broadcast address');
    await expect(app.locator('.nc-values')).not.toContainText('Wildcard mask');
  });

  test('flags RFC 3021 /31 and single-address /32', async ({ app }) => {
    await input(app).fill('10.0.0.0/31');
    await expect(app.locator('.nc-notes')).toContainText('RFC 3021 point-to-point');

    await input(app).fill('10.0.0.5/32');
    await expect(app.locator('.nc-notes')).toContainText('Host route — a single address.');
  });

  test('names the reserved range an address falls in', async ({ app }) => {
    await input(app).fill('192.168.4.0/24');
    await expect(app.locator('.nc-specials')).toContainText('192.168.0.0/16');

    await input(app).fill('127.0.0.1');
    await expect(app.locator('.nc-specials')).toContainText('127.0.0.0/8');
  });

  test('retunes every value from the prefix stepper (FR-CALC-06)', async ({ app }) => {
    await input(app).fill('10.20.0.0/16');
    await expect(app.locator('.nc-stepper__value')).toHaveText('/16');

    await app.getByRole('button', { name: 'Narrow the block' }).click();
    await expect(app.locator('.nc-stepper__value')).toHaveText('/17');
    await expect(field(app, 'Subnet mask')).toHaveText(/255\.255\.128\.0/);
    await expect(input(app)).toHaveValue('10.20.0.0/17');

    await app.getByRole('button', { name: 'Widen the block' }).click();
    await app.getByRole('button', { name: 'Widen the block' }).click();
    await expect(app.locator('.nc-stepper__value')).toHaveText('/15');
  });

  test('draws a bit ruler that marks the prefix boundary', async ({ app }) => {
    await input(app).fill('10.20.0.0/16');
    const cells = app.locator('.nc-ruler__cell');
    await expect(cells).toHaveCount(32);
    await expect(cells.nth(15)).toHaveClass(/is-network/);
    await expect(cells.nth(16)).not.toHaveClass(/is-network/);
  });

  test.describe('rejects malformed input with a specific message', () => {
    const cases: ReadonlyArray<[string, string]> = [
      ['10.0.0.256', 'Each IPv4 octet must be a plain number from 0 to 255'],
      ['10.0.0.0/33', 'The prefix length must be 0–32 for IPv4 or 0–128 for IPv6'],
      ['2001:db8:::1', 'Each IPv6 group must be one to four hexadecimal digits.'],
      ['2001::db8::1', 'An IPv6 address may use “::” only once.'],
      ['10.0.0.0 255.0.255.0', 'A subnet mask must be a run of ones followed only by zeros.'],
      ['2001:db8:: 255.255.0.0', 'IPv6 uses prefix lengths rather than dotted masks — try /64.'],
      ['carrots', 'That does not look like an IPv4 or IPv6 address.'],
    ];

    for (const [value, message] of cases) {
      test(`“${value}”`, async ({ app }) => {
        await input(app).fill(value);
        const error = app.getByRole('alert');
        await expect(error).toContainText(message);
        await expect(input(app)).toHaveAttribute('aria-invalid', 'true');
      });
    }
  });

  test('copies a Markdown summary to the clipboard (FR-EXP-04)', async ({ app }) => {
    await input(app).fill('10.20.0.0/16');
    await app.getByRole('button', { name: 'Copy as Markdown' }).click();
    await expect(app.getByRole('button', { name: 'Copied' })).toBeVisible();

    const copied = await readClipboard(app);
    expect(copied).toContain('10.20.0.0/16');
    expect(copied).toContain('255.255.0.0');
    expect(copied).toContain('Generated by NetCarve');
  });

  test('copies a single value when its chip is clicked (FR-CALC-05)', async ({ app }) => {
    await input(app).fill('10.20.0.0/16');
    await field(app, 'Subnet mask').click();
    expect(await readClipboard(app)).toBe('255.255.0.0');
  });
});
