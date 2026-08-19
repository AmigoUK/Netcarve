import { describe, expect, it } from 'vitest';
import { formatCidr } from '@/src/lib/ip/cidr';
import {
  allocationCidrs,
  blockSizeFor,
  prefixForBlockSize,
  solveVlsm,
  type VlsmRequirement,
  type VlsmSolution,
} from '@/src/lib/vlsm/solver';

function solve(
  base: string,
  requirements: VlsmRequirement[],
  options?: { allowSlash31?: boolean },
): VlsmSolution {
  const result = solveVlsm(base, requirements, options);
  if (!result.ok) throw new Error(result.message);
  return result.solution;
}

const rows = (solution: VlsmSolution) =>
  solution.allocations.map((entry) => [
    entry.name,
    formatCidr(entry.block),
    entry.summary.usable.primary,
    entry.waste.toString(),
  ]);

describe('blockSizeFor (FR-VLSM-02)', () => {
  it.each([
    [1, 4],
    [2, 4],
    [10, 16],
    [14, 16],
    [20, 32],
    [30, 32],
    [50, 64],
    [120, 128],
    [126, 128],
    [127, 256],
    [254, 256],
  ])('%i hosts needs a block of %i addresses', (hosts, size) => {
    expect(blockSizeFor(hosts)).toBe(size);
  });

  it('uses a /31 for two-host links only when they are allowed', () => {
    expect(blockSizeFor(2, true)).toBe(2);
    expect(blockSizeFor(1, true)).toBe(2);
    expect(blockSizeFor(3, true)).toBe(8);
    expect(blockSizeFor(2, false)).toBe(4);
  });

  it('maps a block size to its prefix', () => {
    expect(prefixForBlockSize(256)).toBe(24);
    expect(prefixForBlockSize(2)).toBe(31);
    expect(prefixForBlockSize(1)).toBe(32);
  });
});

describe('the §7 acceptance vector', () => {
  const solution = solve('192.168.10.0/24', [
    { name: 'Warehouse', requiredHosts: 120 },
    { name: 'Office', requiredHosts: 50 },
    { name: 'VoIP', requiredHosts: 20 },
    { name: 'Management', requiredHosts: 10 },
  ]);

  it('allocates exactly as specified', () => {
    expect(rows(solution)).toEqual([
      ['Warehouse', '192.168.10.0/25', '126', '6'],
      ['Office', '192.168.10.128/26', '62', '12'],
      ['VoIP', '192.168.10.192/27', '30', '10'],
      ['Management', '192.168.10.224/28', '14', '4'],
    ]);
  });

  it('leaves exactly one free block', () => {
    expect(solution.free.map(formatCidr)).toEqual(['192.168.10.240/28']);
  });

  it('reports the utilisation', () => {
    expect(solution.allocatedAddresses).toBe(240n);
    expect(solution.totalAddresses).toBe(256n);
    expect(solution.utilisation).toBe('93.8');
    expect(solution.failure).toBeUndefined();
  });

  it('is stable however the requirements are ordered on input', () => {
    const reordered = solve('192.168.10.0/24', [
      { name: 'Management', requiredHosts: 10 },
      { name: 'VoIP', requiredHosts: 20 },
      { name: 'Office', requiredHosts: 50 },
      { name: 'Warehouse', requiredHosts: 120 },
    ]);
    expect(rows(reordered)).toEqual(rows(solution));
  });
});

describe('allocation behaviour', () => {
  it('breaks a size tie by input order', () => {
    const solution = solve('10.0.0.0/24', [
      { name: 'First', requiredHosts: 50 },
      { name: 'Second', requiredHosts: 50 },
    ]);
    expect(rows(solution).map((row) => row[0])).toEqual(['First', 'Second']);
    expect(solution.allocations[0]?.name).toBe('First');
    expect(formatCidr(solution.allocations[0]!.block)).toBe('10.0.0.0/26');
  });

  it('takes the lowest-addressed block that fits', () => {
    const solution = solve('10.0.0.0/24', [
      { name: 'Big', requiredHosts: 100 },
      { name: 'Small', requiredHosts: 10 },
      { name: 'Medium', requiredHosts: 60 },
    ]);
    expect(rows(solution)).toEqual([
      ['Big', '10.0.0.0/25', '126', '26'],
      ['Medium', '10.0.0.128/26', '62', '2'],
      ['Small', '10.0.0.192/28', '14', '4'],
    ]);
  });

  it('fills the base network exactly when the requirements happen to', () => {
    const solution = solve('10.0.0.0/24', [
      { name: 'A', requiredHosts: 126 },
      { name: 'B', requiredHosts: 126 },
    ]);
    expect(solution.free).toEqual([]);
    expect(solution.utilisation).toBe('100');
  });

  it('merges leftovers back into the largest whole blocks', () => {
    const solution = solve('10.0.0.0/24', [{ name: 'Tiny', requiredHosts: 2 }]);
    expect(solution.free.map(formatCidr)).toEqual([
      '10.0.0.4/30',
      '10.0.0.8/29',
      '10.0.0.16/28',
      '10.0.0.32/27',
      '10.0.0.64/26',
      '10.0.0.128/25',
    ]);
  });

  it('honours the /31 toggle end to end', () => {
    const solution = solve(
      '10.0.0.0/29',
      [
        { name: 'Link A', requiredHosts: 2 },
        { name: 'Link B', requiredHosts: 2 },
      ],
      { allowSlash31: true },
    );
    expect(rows(solution)).toEqual([
      ['Link A', '10.0.0.0/31', '2', '0'],
      ['Link B', '10.0.0.2/31', '2', '0'],
    ]);
  });

  it('solves nothing gracefully', () => {
    const solution = solve('10.0.0.0/24', []);
    expect(solution.allocations).toEqual([]);
    expect(solution.free.map(formatCidr)).toEqual(['10.0.0.0/24']);
    expect(solution.utilisation).toBe('0');
  });
});

describe('shortfall reporting (FR-VLSM-05)', () => {
  it('names the requirement that did not fit, and keeps the ones that did', () => {
    // Largest first: Office takes the whole /26, leaving nothing for Warehouse.
    const solution = solve('192.168.10.0/26', [
      { name: 'Warehouse', requiredHosts: 30 },
      { name: 'Office', requiredHosts: 40 },
    ]);
    expect(rows(solution)).toEqual([['Office', '192.168.10.0/26', '62', '22']]);
    expect(solution.failure).toEqual({ name: 'Warehouse', shortfall: 32n });
  });

  it('reports a requirement larger than the base network itself', () => {
    const solution = solve('10.0.0.0/28', [{ name: 'Campus', requiredHosts: 500 }]);
    expect(solution.allocations).toEqual([]);
    expect(solution.failure).toEqual({ name: 'Campus', shortfall: 496n });
  });

  it('reports a shortfall when the free list is empty', () => {
    const solution = solve('10.0.0.0/25', [
      { name: 'A', requiredHosts: 126 },
      { name: 'B', requiredHosts: 10 },
    ]);
    expect(solution.failure?.name).toBe('B');
    expect(solution.failure?.shortfall).toBe(16n);
  });
});

describe('input validation', () => {
  it('refuses an unparsable base network', () => {
    const result = solveVlsm('999.1.1.1/24', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/0 to 255/);
  });

  it('refuses an IPv6 base network (FR-VLSM-01)', () => {
    const result = solveVlsm('2001:db8::/48', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/works on IPv4/);
  });

  it.each([[0], [-5], [2.5]])('refuses a host count of %s', (hosts) => {
    const result = solveVlsm('10.0.0.0/24', [{ name: 'Odd', requiredHosts: hosts }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/whole number of hosts/);
  });

  it('takes the base network from a host address without complaint', () => {
    const solution = solve('192.168.10.37/24', [{ name: 'A', requiredHosts: 10 }]);
    expect(formatCidr(solution.base)).toBe('192.168.10.0/24');
  });
});

describe('allocationCidrs', () => {
  it('hands the planner canonical blocks with their names', () => {
    const solution = solve('192.168.10.0/24', [
      { name: 'Warehouse', requiredHosts: 120 },
      { name: 'Office', requiredHosts: 50 },
    ]);
    expect(allocationCidrs(solution)).toEqual([
      { cidr: '192.168.10.0/25', name: 'Warehouse' },
      { cidr: '192.168.10.128/26', name: 'Office' },
    ]);
  });
});
