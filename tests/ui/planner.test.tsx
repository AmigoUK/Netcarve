import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/entrypoints/app/App';
import { createProject } from '@/src/lib/plan/model';
import { setStorageArea, STORAGE_KEYS, type StorageArea } from '@/src/lib/storage/store';

function memoryArea(seed: Record<string, unknown> = {}): StorageArea & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>(Object.entries(seed));
  return {
    data,
    async get(key) {
      return data.get(key);
    },
    async set(key, value) {
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
  };
}

const PROJECT_ID = 'acme-1';

function seededProject(roots: Array<{ cidr: string }> = []) {
  return { ...createProject('Acme refresh', { client: 'Acme Ltd' }), id: PROJECT_ID, roots };
}

let area: ReturnType<typeof memoryArea>;

beforeEach(() => {
  area = memoryArea();
  setStorageArea(area);
  globalThis.location.hash = '';
});

afterEach(() => {
  setStorageArea(undefined);
  vi.restoreAllMocks();
});

async function openPlanner(roots: Array<{ cidr: string }> = []) {
  await area.set(STORAGE_KEYS.projects, [seededProject(roots)]);
  globalThis.location.hash = `#/planner/${PROJECT_ID}`;
  render(<App version="1.0.0" />);
  return screen.findByRole('heading', { name: 'Acme refresh' });
}

const rowFor = (cidr: string): HTMLElement => {
  const item = screen.getByText(cidr, { selector: '.nc-tree__cidr' }).closest('li');
  if (item === null) throw new Error(`no row for ${cidr}`);
  return item as HTMLElement;
};

describe('Projects (FR-PLAN-01)', () => {
  it('shows an empty state and creates a project', async () => {
    globalThis.location.hash = '#/projects';
    render(<App version="1.0.0" />);

    expect(await screen.findByText(/No projects yet/i)).toBeInTheDocument();

    fireEvent.input(screen.getByLabelText('Project name'), { target: { value: 'Acme refresh' } });
    fireEvent.input(screen.getByLabelText('Client (optional)'), { target: { value: 'Acme Ltd' } });
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));

    expect(await screen.findByRole('heading', { name: 'Acme refresh' })).toBeInTheDocument();
    expect(globalThis.location.hash).toMatch(/^#\/planner\//);
  });

  it('lists a stored project and deletes it behind a confirmation', async () => {
    await area.set(STORAGE_KEYS.projects, [seededProject([{ cidr: '10.20.0.0/16' }])]);
    globalThis.location.hash = '#/projects';
    render(<App version="1.0.0" />);

    expect(await screen.findByRole('heading', { name: 'Acme refresh' })).toBeInTheDocument();
    expect(screen.getByText(/1 root block/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText(/Delete “Acme refresh”\?/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText(/No projects yet/i)).toBeInTheDocument());
  });
});

describe('Planner (the §6 acceptance walkthrough)', () => {
  it('adds a root block and refuses one that overlaps it (FR-PLAN-02)', async () => {
    await openPlanner();

    fireEvent.input(screen.getByLabelText('Add a root block'), {
      target: { value: '10.20.0.0/16' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
    await waitFor(() => expect(screen.getByText('10.20.0.0/16', { selector: '.nc-root__cidr' })).toBeInTheDocument());

    fireEvent.input(screen.getByLabelText('Add a root block'), {
      target: { value: '10.20.1.0/24' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /overlaps 10\.20\.0\.0\/16, which is already in this project/,
    );
  });

  it('splits once into two /17s, then the first into /18s (FR-PLAN-03)', async () => {
    await openPlanner([{ cidr: '10.20.0.0/16' }]);

    fireEvent.click(within(rowFor('10.20.0.0/16')).getByRole('button', { name: 'Split' }));
    await waitFor(() => expect(rowFor('10.20.128.0/17')).toBeInTheDocument());

    fireEvent.click(within(rowFor('10.20.0.0/17')).getByRole('button', { name: 'Split' }));
    await waitFor(() => expect(rowFor('10.20.64.0/18')).toBeInTheDocument());
    expect(rowFor('10.20.0.0/18')).toBeInTheDocument();
  });

  it('names a leaf, gives it a VLAN and a colour from the swatch grid (FR-PLAN-05)', async () => {
    await openPlanner([{ cidr: '10.20.0.0/16' }]);
    fireEvent.click(within(rowFor('10.20.0.0/16')).getByRole('button', { name: 'Split' }));
    await waitFor(() => expect(rowFor('10.20.0.0/17')).toBeInTheDocument());

    fireEvent.click(within(rowFor('10.20.0.0/17')).getByRole('button', { name: 'Edit' }));
    fireEvent.input(await screen.findByLabelText('Name'), {
      target: { value: 'VLAN 10 — Office' },
    });
    fireEvent.input(screen.getByLabelText('VLAN ID'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Blue' }));

    await waitFor(() =>
      expect(within(rowFor('10.20.0.0/17')).getByText('VLAN 10 — Office')).toBeInTheDocument(),
    );
    expect(within(rowFor('10.20.0.0/17')).getByText('VLAN 10')).toBeInTheDocument();
    expect(rowFor('10.20.0.0/17').querySelector('.nc-dot--blue')).not.toBeNull();
  });

  it('rejects a VLAN ID outside 1–4094', async () => {
    await openPlanner([{ cidr: '10.20.0.0/16' }]);
    fireEvent.click(within(rowFor('10.20.0.0/16')).getByRole('button', { name: 'Edit' }));
    fireEvent.input(await screen.findByLabelText('VLAN ID'), { target: { value: '9999' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/1 to 4094/);
  });

  it('joins back with a confirmation naming the affected leaves, and undo restores them', async () => {
    await openPlanner([{ cidr: '10.20.0.0/16' }]);
    fireEvent.click(within(rowFor('10.20.0.0/16')).getByRole('button', { name: 'Split' }));
    await waitFor(() => expect(rowFor('10.20.0.0/17')).toBeInTheDocument());

    fireEvent.click(within(rowFor('10.20.0.0/17')).getByRole('button', { name: 'Edit' }));
    fireEvent.input(await screen.findByLabelText('Name'), { target: { value: 'Office' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    fireEvent.click(within(rowFor('10.20.0.0/16')).getByRole('button', { name: 'Join' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/1 named subnet will be lost/);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(screen.queryByText('10.20.0.0/17')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(rowFor('10.20.0.0/17')).toBeInTheDocument());
    expect(within(rowFor('10.20.0.0/17')).getByText('Office')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    await waitFor(() => expect(screen.queryByText('10.20.0.0/17')).not.toBeInTheDocument());
  });

  it('carves to a target prefix and refuses one past the limit (FR-PLAN-04)', async () => {
    await openPlanner([{ cidr: '10.20.0.0/16' }]);

    fireEvent.click(within(rowFor('10.20.0.0/16')).getByRole('button', { name: 'Split to…' }));
    fireEvent.input(await screen.findByLabelText('Target prefix'), { target: { value: '27' } });
    fireEvent.click(screen.getByRole('button', { name: 'Carve' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/NetCarve stops at 1,024/);

    fireEvent.click(within(rowFor('10.20.0.0/16')).getByRole('button', { name: 'Split to…' }));
    fireEvent.input(await screen.findByLabelText('Target prefix'), { target: { value: '24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Carve' }));

    await waitFor(() => expect(rowFor('10.20.255.0/24')).toBeInTheDocument());
  });

  it('shows the utilisation meter for a root (FR-PLAN-07)', async () => {
    await openPlanner([{ cidr: '10.20.0.0/16' }]);
    fireEvent.click(within(rowFor('10.20.0.0/16')).getByRole('button', { name: 'Split' }));
    await waitFor(() => expect(rowFor('10.20.0.0/17')).toBeInTheDocument());

    fireEvent.click(within(rowFor('10.20.0.0/17')).getByRole('button', { name: 'Edit' }));
    fireEvent.input(await screen.findByLabelText('Name'), { target: { value: 'Office' } });

    await waitFor(() => expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '50'));
  });

  it('badges an IPv6 /64 as the standard subnet size (FR-PLAN-10)', async () => {
    await openPlanner([{ cidr: '2001:db8::/63' }]);
    fireEvent.click(within(rowFor('2001:db8::/63')).getByRole('button', { name: 'Split' }));
    await waitFor(() =>
      expect(within(rowFor('2001:db8::/64')).getByText('Standard IPv6 subnet size.')).toBeInTheDocument(),
    );
  });

  it('is operable from the keyboard (§9.4)', async () => {
    await openPlanner([{ cidr: '10.20.0.0/16' }]);
    const tree = screen.getByRole('tree');

    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    fireEvent.keyDown(tree, { key: 's' });
    await waitFor(() => expect(rowFor('10.20.0.0/17')).toBeInTheDocument());

    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    fireEvent.keyDown(tree, { key: 's' });
    await waitFor(() => expect(rowFor('10.20.0.0/18')).toBeInTheDocument());

    fireEvent.keyDown(tree, { key: 'F2' });
    expect(await screen.findByLabelText('Name')).toBeInTheDocument();
  });

  it('collapses and expands an internal node', async () => {
    await openPlanner([{ cidr: '10.20.0.0/16' }]);
    fireEvent.click(within(rowFor('10.20.0.0/16')).getByRole('button', { name: 'Split' }));
    await waitFor(() => expect(rowFor('10.20.0.0/17')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    await waitFor(() => expect(screen.queryByText('10.20.0.0/17')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    await waitFor(() => expect(rowFor('10.20.0.0/17')).toBeInTheDocument());
  });

  it('autosaves the plan (FR-PLAN-08)', async () => {
    vi.useFakeTimers();
    try {
      await area.set(STORAGE_KEYS.projects, [seededProject([{ cidr: '10.20.0.0/16' }])]);
      globalThis.location.hash = `#/planner/${PROJECT_ID}`;
      render(<App version="1.0.0" />);
      await vi.advanceTimersByTimeAsync(10);

      fireEvent.click(within(rowFor('10.20.0.0/16')).getByRole('button', { name: 'Split' }));
      await vi.advanceTimersByTimeAsync(700);

      const stored = area.data.get(STORAGE_KEYS.projects) as Array<{ roots: unknown[] }>;
      expect(JSON.stringify(stored)).toContain('10.20.128.0/17');
      expect(screen.getByRole('status')).toHaveTextContent('All changes saved');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Export and import (F7)', () => {
  it('copies the plan as Markdown from the planner', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    await openPlanner([{ cidr: '10.20.0.0/16' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Copy as Markdown' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());

    const [markdown] = vi.mocked(navigator.clipboard.writeText).mock.calls[0] as [string];
    expect(markdown).toContain('## Acme refresh');
    expect(markdown).toContain('| Subnet | Mask | Range | Usable | Name | VLAN | Notes |');
  });

  it('downloads CSV and JSON through an object URL', async () => {
    const createObjectURL = vi.fn(() => 'blob:netcarve');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await openPlanner([{ cidr: '10.20.0.0/16' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }));

    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('imports a project from a NetCarve JSON file', async () => {
    globalThis.location.hash = '#/projects';
    render(<App version="1.0.0" />);
    await screen.findByText(/No projects yet/i);

    const envelope = {
      app: 'netcarve',
      schemaVersion: 1,
      project: { ...createProject('Imported plan'), id: 'imported-1', roots: [{ cidr: '10.0.0.0/8' }] },
    };
    const file = new File([JSON.stringify(envelope)], 'plan.json', { type: 'application/json' });
    const input = screen.getByLabelText('Choose a NetCarve JSON file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    expect(await screen.findByRole('heading', { name: 'Imported plan' })).toBeInTheDocument();
  });

  it('refuses a file that is not a NetCarve export', async () => {
    globalThis.location.hash = '#/projects';
    render(<App version="1.0.0" />);
    await screen.findByText(/No projects yet/i);

    const file = new File(['{"app":"other"}'], 'plan.json', { type: 'application/json' });
    const input = screen.getByLabelText('Choose a NetCarve JSON file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'That file is not a NetCarve export.',
    );
  });
});
