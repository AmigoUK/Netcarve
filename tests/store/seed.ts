/**
 * Realistic sample plans for the store screenshots.
 *
 * The planner refuses a tree whose children are not a block's two exact halves, so the plan
 * is built the same way the UI builds it — by halving — rather than hand-written.
 */

export interface SeedLeaf {
  readonly cidr: string;
  readonly name?: string;
  readonly vlanId?: number;
  readonly colour?: string;
  readonly notes?: string;
}

interface Node {
  cidr: string;
  name?: string;
  vlanId?: number;
  colour?: string;
  notes?: string;
  children?: [Node, Node];
}

const toInt = (address: string): number =>
  address.split('.').reduce((total, octet) => total * 256 + Number(octet), 0) >>> 0;

const toText = (value: number): string =>
  [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');

const parse = (cidr: string): [number, number] => {
  const [address = '', prefix = ''] = cidr.split('/');
  return [toInt(address), Number(prefix)];
};

const contains = (outer: string, inner: string): boolean => {
  const [outerBase, outerPrefix] = parse(outer);
  const [innerBase, innerPrefix] = parse(inner);
  if (innerPrefix < outerPrefix) return false;
  const mask = outerPrefix === 0 ? 0 : (0xffffffff << (32 - outerPrefix)) >>> 0;
  return (innerBase & mask) >>> 0 === (outerBase & mask) >>> 0;
};

const halves = (cidr: string): [string, string] => {
  const [base, prefix] = parse(cidr);
  const step = 2 ** (32 - prefix - 1);
  return [`${toText(base)}/${prefix + 1}`, `${toText(base + step)}/${prefix + 1}`];
};

function build(cidr: string, leaves: readonly SeedLeaf[]): Node {
  const exact = leaves.find((leaf) => leaf.cidr === cidr);
  if (exact !== undefined) {
    const { cidr: _ignored, ...metadata } = exact;
    return { cidr, ...metadata };
  }
  const inside = leaves.filter((leaf) => contains(cidr, leaf.cidr));
  if (inside.length === 0) return { cidr };
  const [left, right] = halves(cidr);
  return { cidr, children: [build(left, inside), build(right, inside)] };
}

/** A whole project, ready to drop into `chrome.storage.local`. */
export function seedProject(options: {
  id: string;
  name: string;
  client?: string;
  roots: ReadonlyArray<{ cidr: string; leaves: readonly SeedLeaf[] }>;
  createdAt: number;
  updatedAt: number;
}) {
  return {
    schemaVersion: 1,
    id: options.id,
    name: options.name,
    ...(options.client === undefined ? {} : { client: options.client }),
    createdAt: options.createdAt,
    updatedAt: options.updatedAt,
    roots: options.roots.map((root) => build(root.cidr, root.leaves)),
  };
}

/** The plan shown in the planner screenshots — a mid-size office refresh. */
export const ACME = seedProject({
  id: 'a1f0c6d2-0000-4000-8000-000000000001',
  name: 'Head office refresh',
  client: 'Acme Ltd',
  createdAt: Date.UTC(2026, 6, 2, 9, 30),
  updatedAt: Date.UTC(2026, 7, 18, 16, 5),
  roots: [
    {
      cidr: '10.20.0.0/16',
      leaves: [
        { cidr: '10.20.0.0/20', name: 'VLAN 10 — Office', vlanId: 10, colour: 'blue' },
        { cidr: '10.20.16.0/20', name: 'VLAN 20 — Voice', vlanId: 20, colour: 'teal' },
        { cidr: '10.20.32.0/20', name: 'VLAN 30 — Guest Wi-Fi', vlanId: 30, colour: 'violet' },
        { cidr: '10.20.48.0/20', name: 'VLAN 40 — Printers', vlanId: 40, colour: 'amber' },
        { cidr: '10.20.64.0/19', name: 'Servers', vlanId: 100, colour: 'green' },
        { cidr: '10.20.96.0/19', name: 'Storage', vlanId: 110, colour: 'grey' },
        { cidr: '10.20.128.0/18', name: 'Branch offices', colour: 'pink' },
        { cidr: '10.20.192.0/18' },
      ],
    },
  ],
});
