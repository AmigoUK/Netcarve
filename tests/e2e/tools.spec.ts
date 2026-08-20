import { test, expect, goToRoute, readClipboard, resetStorage } from './fixtures';

/**
 * The tools page, driven through the real extension.
 *
 * Playwright matches labels by substring, and the bit field labels every cell "Bit N, value X",
 * so the converter's own field is asked for exactly and inside its section.
 */
const CONVERTER = '#nc-converter';
test.describe('the tools page (F9)', () => {
  test.beforeEach(async ({ app }) => {
    await resetStorage(app);
    await goToRoute(app, '/tools');
  });

  test('converts a dotted quad into every base', async ({ app }) => {
    await app.locator(CONVERTER).getByLabel('Value', { exact: true }).fill('192.168.1.1');

    const converter = app.locator(CONVERTER);
    await expect(converter.getByLabel(/^Copy Decimal: 3232235777/)).toBeVisible();
    await expect(converter.getByLabel(/^Copy Hexadecimal: 0xC0A80101/)).toBeVisible();
    await expect(converter.getByLabel(/^Copy IPv4 address: 192\.168\.1\.1/)).toBeVisible();
  });

  test('disables the widths that cannot hold the value', async ({ app }) => {
    await app.locator(CONVERTER).getByLabel('Value', { exact: true }).fill('192.168.1.1');
    await expect(app.getByRole('radio', { name: '8 bits', exact: true })).toBeDisabled();
    await expect(app.getByRole('radio', { name: '32 bits', exact: true })).toBeEnabled();
    await expect(app.getByRole('radio', { name: '128 bits', exact: true })).toBeEnabled();
  });

  test('flips a bit and every base follows', async ({ app }) => {
    await app.locator(CONVERTER).getByLabel('Value', { exact: true }).fill('192.168.1.1');
    const converter = app.locator(CONVERTER);
    await expect(converter.getByLabel(/^Copy Decimal: 3232235777/)).toBeVisible();

    // Bit 0 is the least significant, and it is set in 192.168.1.1.
    await converter.getByRole('button', { name: 'Bit 0, value 1' }).click();
    await expect(converter.getByLabel(/^Copy IPv4 address: 192\.168\.1\.0/)).toBeVisible();
  });

  test('masks an address with a bitwise AND', async ({ app }) => {
    await app.getByLabel('Operand A').fill('10.20.30.40');
    await app.getByLabel('Operand B').fill('255.255.0.0');
    await expect(app.locator('#nc-bitwise').getByLabel(/^Copy Result: 10\.20\.0\.0/)).toBeVisible();
  });

  test('converts a prefix to a mask and back', async ({ app }) => {
    await app.getByLabel('Prefix length').fill('26');
    await expect(app.getByLabel('Subnet mask')).toHaveValue('255.255.255.192');
    await expect(app.locator('#nc-masks').getByLabel(/^Copy Wildcard mask: 0\.0\.0\.63/)).toBeVisible();

    await app.getByLabel('Subnet mask').fill('255.255.240.0');
    await expect(app.getByLabel('Prefix length')).toHaveValue('20');
  });

  test('refuses a bare hexadecimal value rather than guessing', async ({ app }) => {
    await app.locator(CONVERTER).getByLabel('Value', { exact: true }).fill('C0A8');
    await expect(app.getByRole('alert').first()).toContainText('Prefix hexadecimal with 0x');
  });

  test('copies the converter table to the clipboard', async ({ app }) => {
    await app.locator(CONVERTER).getByLabel('Value', { exact: true }).fill('192.168.1.1');
    await app.locator(CONVERTER).getByRole('button', { name: 'Copy as Markdown' }).click();

    const copied = await readClipboard(app);
    expect(copied).toContain('| Decimal | 3232235777 |');
    expect(copied).toContain('| IPv4 address | 192.168.1.1 |');
  });

  test('the calculator hands a network address over', async ({ app }) => {
    await goToRoute(app, '/calc');
    await app.getByLabel('IP address or CIDR block').fill('192.168.1.37/24');
    await app.getByRole('link', { name: /Open in converter/ }).click();

    await expect(app.locator(CONVERTER).getByLabel('Value', { exact: true })).toHaveValue('192.168.1.0');
    await expect(app.locator(CONVERTER).getByLabel(/^Copy Decimal: 3232235776/)).toBeVisible();
  });
});
