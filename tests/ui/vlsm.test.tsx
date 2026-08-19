import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/entrypoints/app/App';
import { solveVlsm } from '@/src/lib/vlsm/solver';
import { solutionToRoot } from '@/src/lib/vlsm/toPlan';
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

let area: ReturnType<typeof memoryArea>;

beforeEach(() => {
  area = memoryArea();
  setStorageArea(area);
  globalThis.location.hash = '#/vlsm';
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

afterEach(() => {
  setStorageArea(undefined);
  vi.restoreAllMocks();
});

const REQUIREMENTS: Array<[string, string]> = [
  ['Warehouse', '120'],
  ['Office', '50'],
  ['VoIP', '20'],
  ['Management', '10'],
];

async function enterCanonicalVector() {
  render(<App version="1.0.0" />);
  fireEvent.input(screen.getByLabelText('Base network'), {
    target: { value: '192.168.10.0/24' },
  });

  for (const [index, [name, hosts]] of REQUIREMENTS.entries()) {
    if (index > 0) fireEvent.click(screen.getByRole('button', { name: 'Add requirement' }));
    fireEvent.input(screen.getByLabelText(`Name ${index + 1}`), { target: { value: name } });
    fireEvent.input(screen.getByLabelText(`Hosts ${index + 1}`), { target: { value: hosts } });
  }
}

describe('solutionToRoot (FR-VLSM-06)', () => {
  it('rebuilds the allocation as a valid planner tree', () => {
    const result = solveVlsm('192.168.10.0/24', [
      { name: 'Warehouse', requiredHosts: 120 },
      { name: 'Office', requiredHosts: 50 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(solutionToRoot(result.solution)).toEqual({
      cidr: '192.168.10.0/24',
      children: [
        { cidr: '192.168.10.0/25', name: 'Warehouse' },
        {
          cidr: '192.168.10.128/25',
          children: [
            { cidr: '192.168.10.128/26', name: 'Office' },
            { cidr: '192.168.10.192/26' },
          ],
        },
      ],
    });
  });
});

describe('VLSM solver view (F4)', () => {
  it('starts with an empty state', () => {
    render(<App version="1.0.0" />);
    expect(screen.getByText(/Add a base network and at least one requirement/i)).toBeInTheDocument();
  });

  it('solves the §7 acceptance vector as you type (FR-VLSM-04)', async () => {
    await enterCanonicalVector();

    const table = await screen.findByRole('table');
    const cells = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));

    expect(cells).toEqual([
      ['Warehouse', '192.168.10.0/25', '255.255.255.128', '192.168.10.0 – 192.168.10.127', '126', '6'],
      ['Office', '192.168.10.128/26', '255.255.255.192', '192.168.10.128 – 192.168.10.191', '62', '12'],
      ['VoIP', '192.168.10.192/27', '255.255.255.224', '192.168.10.192 – 192.168.10.223', '30', '10'],
      ['Management', '192.168.10.224/28', '255.255.255.240', '192.168.10.224 – 192.168.10.239', '14', '4'],
    ]);

    expect(screen.getByText('192.168.10.240/28')).toBeInTheDocument();
    expect(
      screen.getByText('240 of 256 addresses allocated — 93.8% utilisation.'),
    ).toBeInTheDocument();
  });

  it('reports a shortfall (FR-VLSM-05)', async () => {
    render(<App version="1.0.0" />);
    fireEvent.input(screen.getByLabelText('Base network'), { target: { value: '10.0.0.0/28' } });
    fireEvent.input(screen.getByLabelText('Name 1'), { target: { value: 'Campus' } });
    fireEvent.input(screen.getByLabelText('Hosts 1'), { target: { value: '500' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Campus does not fit. The base network is 496 addresses short.',
    );
  });

  it('reports an unusable base network', async () => {
    render(<App version="1.0.0" />);
    fireEvent.input(screen.getByLabelText('Base network'), { target: { value: '2001:db8::/48' } });
    fireEvent.input(screen.getByLabelText('Hosts 1'), { target: { value: '10' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/works on IPv4/);
  });

  it('reorders and removes requirements (FR-VLSM-01)', async () => {
    render(<App version="1.0.0" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add requirement' }));
    fireEvent.input(screen.getByLabelText('Name 1'), { target: { value: 'First' } });
    fireEvent.input(screen.getByLabelText('Name 2'), { target: { value: 'Second' } });

    fireEvent.click(screen.getByLabelText('Move down: First'));
    await waitFor(() =>
      expect((screen.getByLabelText('Name 1') as HTMLInputElement).value).toBe('Second'),
    );

    fireEvent.click(screen.getByLabelText('Remove Second'));
    await waitFor(() =>
      expect((screen.getByLabelText('Name 1') as HTMLInputElement).value).toBe('First'),
    );
  });

  it('copies the allocation as Markdown (FR-VLSM-07)', async () => {
    await enterCanonicalVector();
    await screen.findByRole('table');

    fireEvent.click(screen.getByRole('button', { name: 'Copy as Markdown' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());

    const [markdown] = vi.mocked(navigator.clipboard.writeText).mock.calls[0] as [string];
    expect(markdown).toContain('| Name | Allocated block | Mask | Range | Usable | Waste |');
    expect(markdown).toContain('| Warehouse | 192.168.10.0/25 |');
    expect(markdown).toContain('- `192.168.10.240/28`');
  });

  it('sends the solution to a new project (FR-VLSM-06)', async () => {
    await enterCanonicalVector();
    await screen.findByRole('table');

    fireEvent.click(screen.getByRole('button', { name: 'Send to planner' }));

    expect(
      await screen.findByRole('heading', { name: 'VLSM plan for 192.168.10.0/24' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Warehouse')).toBeInTheDocument();
    expect(screen.getByText('Management')).toBeInTheDocument();
    expect(globalThis.location.hash).toMatch(/^#\/planner\//);
  });

  it('adds the solution as a new root in an existing project', async () => {
    await area.set(STORAGE_KEYS.projects, [
      {
        id: 'acme-1',
        schemaVersion: 1,
        name: 'Acme refresh',
        createdAt: 1,
        updatedAt: 1,
        roots: [{ cidr: '172.16.0.0/12' }],
      },
    ]);
    await enterCanonicalVector();
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText('Add to'), { target: { value: 'acme-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to planner' }));

    expect(await screen.findByRole('heading', { name: 'Acme refresh' })).toBeInTheDocument();
    expect(screen.getByText('172.16.0.0/12', { selector: '.nc-root__cidr' })).toBeInTheDocument();
    expect(screen.getByText('192.168.10.0/24', { selector: '.nc-root__cidr' })).toBeInTheDocument();
  });
});
