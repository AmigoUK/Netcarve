import { test, expect, goToRoute, readStorage, resetStorage } from './fixtures';
import type { Page } from '@playwright/test';

const PROJECTS_KEY = 'netcarve:projects';

/** Creates a project from the Projects view and lands on its planner. */
async function newProject(page: Page, name: string, client?: string): Promise<void> {
  await goToRoute(page, '/projects');
  await page.getByLabel('Project name').fill(name);
  if (client !== undefined) await page.getByLabel('Client (optional)').fill(client);
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
}

async function addRoot(page: Page, cidr: string): Promise<void> {
  await page.getByLabel('Add a root block').fill(cidr);
  await page.getByRole('button', { name: 'Add block' }).click();
}

const rows = (page: Page) => page.locator('.nc-tree__item');
const row = (page: Page, cidr: string) =>
  page.locator('.nc-tree__item').filter({ has: page.locator(`.nc-tree__cidr:text-is("${cidr}")`) });

test.describe('projects and the planner (F2, F3)', () => {
  test.beforeEach(async ({ app }) => {
    await resetStorage(app);
  });

  test('creates a project, keeps its client and lists it again', async ({ app }) => {
    await newProject(app, 'Head office refresh', 'Acme Ltd');
    await app.getByRole('button', { name: 'All projects' }).click();

    const card = app.locator('.nc-card').filter({ hasText: 'Head office refresh' });
    await expect(card).toBeVisible();
    await expect(card.locator('.nc-card__client')).toHaveText('Acme Ltd');
    await expect(card).toContainText('0 root blocks');
  });

  test('lays the add-a-root form out as one row', async ({ app }) => {
    await newProject(app, 'Layout');
    const form = app.locator('form.nc-row');
    const field = form.locator('.nc-field--grow');
    const button = form.getByRole('button', { name: 'Add block' });

    const [formBox, fieldBox, buttonBox] = await Promise.all([
      form.boundingBox(),
      field.boundingBox(),
      button.boundingBox(),
    ]);

    // The input and the button sit side by side, not stacked, and the panel stays compact.
    expect(buttonBox!.x).toBeGreaterThan(fieldBox!.x + fieldBox!.width - 1);
    expect(fieldBox!.height).toBeLessThan(90);
    expect(formBox!.height).toBeLessThan(140);
  });

  test('refuses a root block that overlaps one already in the plan', async ({ app }) => {
    await newProject(app, 'Overlap check');
    await addRoot(app, '10.20.0.0/16');
    await addRoot(app, '10.20.128.0/17');

    await expect(app.getByRole('alert')).toContainText('overlaps 10.20.0.0/16');
    await expect(app.locator('.nc-root')).toHaveCount(1);
  });

  test('splits a block in half and back again', async ({ app }) => {
    await newProject(app, 'Split and join');
    await addRoot(app, '10.20.0.0/16');
    await expect(rows(app)).toHaveCount(1);

    await row(app, '10.20.0.0/16').getByRole('button', { name: 'Split', exact: true }).click();
    await expect(rows(app)).toHaveCount(3);
    await expect(row(app, '10.20.0.0/17')).toBeVisible();
    await expect(row(app, '10.20.128.0/17')).toBeVisible();

    await row(app, '10.20.0.0/16').getByRole('button', { name: 'Join', exact: true }).click();
    await expect(app.getByRole('alertdialog')).toContainText('Join 10.20.0.0/16 back into one');
    await app
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Join', exact: true })
      .click();
    await expect(rows(app)).toHaveCount(1);
  });

  test('carves a block straight to a target prefix', async ({ app }) => {
    await newProject(app, 'Split to');
    await addRoot(app, '10.20.0.0/16');

    await row(app, '10.20.0.0/16').getByRole('button', { name: 'Split to…' }).click();
    await app.getByLabel('Target prefix').fill('20');
    await app.getByRole('button', { name: 'Carve' }).click();

    // Splitting to a target keeps every level it passed through: 1 + 2 + 4 + 8 + 16.
    await expect(rows(app)).toHaveCount(31);
    await expect(row(app, '10.20.240.0/20')).toBeVisible();
  });

  test('stops a split that would blow past the leaf limit', async ({ app }) => {
    await newProject(app, 'Leaf limit');
    await addRoot(app, '10.0.0.0/8');

    await row(app, '10.0.0.0/8').getByRole('button', { name: 'Split to…' }).click();
    await app.getByLabel('Target prefix').fill('24');
    await app.getByRole('button', { name: 'Carve' }).click();

    await expect(app.getByRole('alert')).toContainText('NetCarve stops at');
    await expect(rows(app)).toHaveCount(1);
  });

  test('names a subnet, gives it a VLAN and a colour, and persists it', async ({ app }) => {
    await newProject(app, 'Naming');
    await addRoot(app, '10.20.0.0/16');
    await row(app, '10.20.0.0/16').getByRole('button', { name: 'Split', exact: true }).click();

    await row(app, '10.20.0.0/17').getByRole('button', { name: 'Edit' }).click();
    const editor = app.locator('.nc-editor');
    await editor.getByLabel('Name').fill('VLAN 10 — Office');
    await editor.getByLabel('VLAN ID').fill('10');
    await editor.getByRole('radio', { name: 'Green' }).click();
    await editor.getByLabel('Notes').fill('Desk switches');
    await editor.getByRole('button', { name: 'Done' }).click();

    const named = row(app, '10.20.0.0/17');
    await expect(named.locator('.nc-tree__name')).toHaveText('VLAN 10 — Office');
    await expect(named.locator('.nc-tree__vlan')).toHaveText('VLAN 10');
    await expect(named.locator('.nc-dot').first()).toHaveClass(/nc-dot--green/);

    await expect
      .poll(async () => JSON.stringify(await readStorage(app, PROJECTS_KEY)))
      .toContain('VLAN 10 — Office');

    await app.reload();
    await expect(row(app, '10.20.0.0/17').locator('.nc-tree__name')).toHaveText(
      'VLAN 10 — Office',
    );
    await expect(row(app, '10.20.0.0/17').locator('.nc-tree__vlan')).toHaveText('VLAN 10');
  });

  test('refuses a VLAN ID outside 1–4094', async ({ app }) => {
    await newProject(app, 'VLAN range');
    await addRoot(app, '10.20.0.0/16');
    await row(app, '10.20.0.0/16').getByRole('button', { name: 'Edit' }).click();
    // A root with no children is a leaf, so the VLAN field is available.
    await app.locator('.nc-editor').getByLabel('VLAN ID').fill('9999');
    await expect(app.locator('.nc-editor').getByRole('alert')).toContainText(
      'A VLAN ID is a whole number from 1 to 4094.',
    );
  });

  test('tracks utilisation as subnets get named', async ({ app }) => {
    await newProject(app, 'Utilisation');
    await addRoot(app, '10.20.0.0/16');
    await row(app, '10.20.0.0/16').getByRole('button', { name: 'Split', exact: true }).click();
    await expect(app.locator('.nc-root__meter')).toContainText('0% planned');

    await row(app, '10.20.0.0/17').getByRole('button', { name: 'Edit' }).click();
    await app.locator('.nc-editor').getByLabel('Name').fill('Left half');
    await app.locator('.nc-editor').getByRole('button', { name: 'Done' }).click();

    await expect(app.locator('.nc-root__meter')).toContainText('50% planned');
  });

  test('undoes and redoes a split', async ({ app }) => {
    await newProject(app, 'History');
    await addRoot(app, '10.20.0.0/16');
    await row(app, '10.20.0.0/16').getByRole('button', { name: 'Split', exact: true }).click();
    await expect(rows(app)).toHaveCount(3);

    await app.getByRole('button', { name: 'Undo' }).click();
    await expect(rows(app)).toHaveCount(1);

    await app.getByRole('button', { name: 'Redo' }).click();
    await expect(rows(app)).toHaveCount(3);
  });

  test('drives the tree from the keyboard (FR-PLAN-09)', async ({ app }) => {
    await newProject(app, 'Keyboard');
    await addRoot(app, '10.20.0.0/16');

    await app.locator('.nc-tree__row').first().click();
    await app.keyboard.press('s');
    await expect(rows(app)).toHaveCount(3);

    await app.keyboard.press('ArrowDown');
    await expect(app.locator('.nc-tree__item.is-selected .nc-tree__cidr')).toHaveText(
      '10.20.0.0/17',
    );

    await app.keyboard.press('F2');
    await expect(app.locator('.nc-editor')).toBeVisible();
  });

  test('collapses and expands a branch', async ({ app }) => {
    await newProject(app, 'Collapse');
    await addRoot(app, '10.20.0.0/16');
    await row(app, '10.20.0.0/16').getByRole('button', { name: 'Split', exact: true }).click();

    await app.getByRole('button', { name: 'Collapse' }).first().click();
    await expect(rows(app)).toHaveCount(1);
    await app.getByRole('button', { name: 'Expand' }).first().click();
    await expect(rows(app)).toHaveCount(3);
  });

  test('removes a root block and then the whole project', async ({ app }) => {
    await newProject(app, 'Removal');
    await addRoot(app, '10.20.0.0/16');
    await app.getByRole('button', { name: 'Remove root block' }).click();
    await expect(app.locator('.nc-empty')).toContainText('No blocks yet');

    await app.getByRole('button', { name: 'All projects' }).click();
    await app.locator('.nc-card').getByRole('button', { name: 'Delete' }).click();
    await expect(app.getByRole('alertdialog')).toContainText('Delete “Removal”?');
    await app.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();

    await expect(app.locator('.nc-empty')).toContainText('No projects yet');
    await expect.poll(async () => JSON.stringify(await readStorage(app, PROJECTS_KEY))).not.toContain(
      'Removal',
    );
  });

  test('survives a reload with the plan intact (FR-STOR-01)', async ({ app }) => {
    await newProject(app, 'Persistence');
    await addRoot(app, '10.20.0.0/16');
    await row(app, '10.20.0.0/16').getByRole('button', { name: 'Split', exact: true }).click();
    await expect(app.locator('.nc-save')).toHaveText('All changes saved');

    const url = app.url();
    await app.goto('about:blank');
    await app.goto(url);
    await expect(rows(app)).toHaveCount(3);
  });
});
