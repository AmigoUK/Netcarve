import { describe, expect, it } from 'vitest';
import { MAX_LEAVES_PER_ROOT } from '@/src/lib/plan/limits';
import {
  createProject,
  normaliseProject,
  PALETTE,
  validateRoot,
  type PlanNode,
} from '@/src/lib/plan/model';
import {
  countLeaves,
  countNamedLeaves,
  flattenTree,
  isLeaf,
  joinNode,
  leavesOf,
  nodeAt,
  pathKey,
  splitNode,
  splitToPrefix,
  updateNode,
  utilisation,
  type PlanResult,
} from '@/src/lib/plan/tree';

const root = (cidr: string): PlanNode => ({ cidr });

function unwrap(result: PlanResult<PlanNode>): PlanNode {
  if (!result.ok) throw new Error(`expected success, got ${result.code}`);
  return result.value;
}

const cidrs = (node: PlanNode): string[] => leavesOf(node).map((leaf) => leaf.cidr);

describe('splitNode', () => {
  it('splits a leaf into its two halves', () => {
    const after = unwrap(splitNode(root('10.20.0.0/16'), []));
    expect(cidrs(after)).toEqual(['10.20.0.0/17', '10.20.128.0/17']);
    expect(isLeaf(after)).toBe(false);
  });

  it('splits a nested leaf', () => {
    let tree = unwrap(splitNode(root('10.20.0.0/16'), []));
    tree = unwrap(splitNode(tree, [0]));
    expect(cidrs(tree)).toEqual(['10.20.0.0/18', '10.20.64.0/18', '10.20.128.0/17']);
  });

  it('keeps an internal node name but drops leaf-only metadata', () => {
    const named: PlanNode = { cidr: '10.0.0.0/8', name: 'Core', colour: 'blue', vlanId: 10 };
    const after = unwrap(splitNode(named, []));
    expect(after.name).toBe('Core');
    expect(after.colour).toBeUndefined();
    expect(after.vlanId).toBeUndefined();
  });

  it('refuses to split a node that already has children', () => {
    const tree = unwrap(splitNode(root('10.0.0.0/8'), []));
    const again = splitNode(tree, []);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('NOT_A_LEAF');
  });

  it('refuses a path that does not exist', () => {
    const result = splitNode(root('10.0.0.0/8'), [1]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('refuses to split a single address', () => {
    const result = splitNode(root('10.0.0.1/32'), []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('AT_MAX_PREFIX');
  });

  it('works the same for IPv6', () => {
    const after = unwrap(splitNode(root('2001:db8::/48'), []));
    expect(cidrs(after)).toEqual(['2001:db8::/49', '2001:db8:0:8000::/49']);
  });
});

describe('splitToPrefix (FR-PLAN-04)', () => {
  it('carves a /16 into 256 /24s', () => {
    const after = unwrap(splitToPrefix(root('10.20.0.0/16'), [], 24));
    expect(countLeaves(after)).toBe(256);
    expect(cidrs(after)[0]).toBe('10.20.0.0/24');
    expect(cidrs(after)[255]).toBe('10.20.255.0/24');
  });

  it('refuses to exceed the 1,024-leaf limit', () => {
    const result = splitToPrefix(root('10.20.0.0/16'), [], 27);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('LEAF_LIMIT');
      expect(Number(result.detail)).toBeGreaterThan(MAX_LEAVES_PER_ROOT);
    }
  });

  it('allows exactly the limit', () => {
    const after = unwrap(splitToPrefix(root('10.20.0.0/16'), [], 26));
    expect(countLeaves(after)).toBe(MAX_LEAVES_PER_ROOT);
  });

  it('counts the leaves already in the tree', () => {
    const half = unwrap(splitNode(root('10.20.0.0/16'), []));
    const result = splitToPrefix(half, [0], 27);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('LEAF_LIMIT');
  });

  it.each([[16], [8], [33], [24.5]])('refuses the target prefix /%s', (target) => {
    const result = splitToPrefix(root('10.20.0.0/16'), [], target);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('BAD_TARGET_PREFIX');
  });

  it('refuses an enormous IPv6 carve without trying it', () => {
    const result = splitToPrefix(root('2001:db8::/32'), [], 96);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('LEAF_LIMIT');
  });

  it('refuses a path that does not exist', () => {
    const result = splitToPrefix(root('10.0.0.0/8'), [0], 24);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });
});

describe('joinNode', () => {
  it('collapses a whole subtree', () => {
    let tree = unwrap(splitToPrefix(root('10.20.0.0/16'), [], 18));
    tree = unwrap(updateNode(tree, [0, 0], { name: 'VLAN 10 — Office' }));
    expect(countLeaves(tree)).toBe(4);

    const joined = unwrap(joinNode(tree, []));
    expect(countLeaves(joined)).toBe(1);
    expect(cidrs(joined)).toEqual(['10.20.0.0/16']);
  });

  it('reports how many named leaves a join would destroy', () => {
    let tree = unwrap(splitToPrefix(root('10.20.0.0/16'), [], 18));
    tree = unwrap(updateNode(tree, [0, 0], { name: 'VLAN 10 — Office' }));
    expect(countNamedLeaves(tree)).toBe(1);
    expect(countLeaves(tree)).toBe(4);
  });

  it('refuses to join a leaf', () => {
    const result = joinNode(root('10.0.0.0/8'), []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_A_BRANCH');
  });

  it('refuses a path that does not exist', () => {
    const result = joinNode(root('10.0.0.0/8'), [0, 1]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });
});

describe('updateNode (FR-PLAN-05)', () => {
  it('sets and clears metadata', () => {
    let tree = unwrap(updateNode(root('10.0.0.0/8'), [], { name: 'Core', vlanId: 10, colour: 'blue' }));
    expect(tree).toEqual({ cidr: '10.0.0.0/8', name: 'Core', vlanId: 10, colour: 'blue' });

    tree = unwrap(updateNode(tree, [], { name: '   ', vlanId: undefined, colour: undefined }));
    expect(tree).toEqual({ cidr: '10.0.0.0/8' });
  });

  it('leaves the rest of the tree untouched', () => {
    const before = unwrap(splitNode(root('10.0.0.0/8'), []));
    const after = unwrap(updateNode(before, [1], { name: 'Upper half' }));
    expect(after.children?.[0]).toBe(before.children?.[0]);
    expect(after.children?.[1].name).toBe('Upper half');
  });

  it('refuses a path that does not exist', () => {
    const result = updateNode(root('10.0.0.0/8'), [0], { name: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });
});

describe('nodeAt / flattenTree', () => {
  it('addresses nodes by path', () => {
    const tree = unwrap(splitToPrefix(root('10.20.0.0/16'), [], 18));
    expect(nodeAt(tree, [])?.cidr).toBe('10.20.0.0/16');
    expect(nodeAt(tree, [0])?.cidr).toBe('10.20.0.0/17');
    expect(nodeAt(tree, [1, 1])?.cidr).toBe('10.20.192.0/18');
    expect(nodeAt(tree, [1, 1, 0])).toBeUndefined();
  });

  it('flattens in address order with depths', () => {
    const tree = unwrap(splitToPrefix(root('10.20.0.0/16'), [], 17));
    const rows = flattenTree(tree);
    expect(rows.map((row) => row.node.cidr)).toEqual([
      '10.20.0.0/16',
      '10.20.0.0/17',
      '10.20.128.0/17',
    ]);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 1]);
    expect(rows.map((row) => row.leaf)).toEqual([false, true, true]);
  });

  it('stops at a collapsed node', () => {
    const tree = unwrap(splitToPrefix(root('10.20.0.0/16'), [], 18));
    const rows = flattenTree(tree, new Set([pathKey([0])]));
    expect(rows.map((row) => row.node.cidr)).toEqual([
      '10.20.0.0/16',
      '10.20.0.0/17',
      '10.20.128.0/17',
      '10.20.128.0/18',
      '10.20.192.0/18',
    ]);
  });
});

describe('utilisation (FR-PLAN-07)', () => {
  it('counts only named leaves as planned', () => {
    let tree = unwrap(splitToPrefix(root('10.20.0.0/16'), [], 18));
    expect(utilisation(tree)).toEqual({ named: 0n, total: 65536n, free: 65536n });

    tree = unwrap(updateNode(tree, [0, 0], { name: 'Office' }));
    expect(utilisation(tree)).toEqual({ named: 16384n, total: 65536n, free: 49152n });

    tree = unwrap(updateNode(tree, [0, 1], { name: '  ' }));
    expect(utilisation(tree).named).toBe(16384n);
  });

  it('works on IPv6 blocks', () => {
    let tree = unwrap(splitToPrefix(root('2001:db8::/48'), [], 49));
    tree = unwrap(updateNode(tree, [0], { name: 'Site A' }));
    expect(utilisation(tree)).toEqual({
      named: 2n ** 79n,
      total: 2n ** 80n,
      free: 2n ** 79n,
    });
  });
});

describe('the model invariant', () => {
  it('accepts a tree whose children are exactly splitOnce(cidr)', () => {
    const tree = unwrap(splitToPrefix(root('10.20.0.0/16'), [], 18));
    expect(validateRoot(tree).ok).toBe(true);
  });

  it.each<[string, unknown]>([
    ['a node that is not an object', 'nope'],
    ['a node with no block', { name: 'x' }],
    ['an unparsable block', { cidr: '10.0.0.0/99' }],
    ['a block that is not a network address', { cidr: '10.0.0.1/8' }],
    [
      'children that are not the two halves',
      { cidr: '10.0.0.0/8', children: [{ cidr: '10.0.0.0/9' }, { cidr: '10.64.0.0/10' }] },
    ],
    ['a malformed pair of children', { cidr: '10.0.0.0/8', children: [{ cidr: '10.0.0.0/9' }] }],
    ['children under a single address', { cidr: '10.0.0.1/32', children: [1, 2] }],
  ])('rejects %s', (_label, raw) => {
    expect(validateRoot(raw).ok).toBe(false);
  });

  it('drops metadata that no longer makes sense but keeps the node', () => {
    const result = validateRoot({
      cidr: '10.0.0.0/8',
      name: 'Core',
      colour: 'chartreuse',
      vlanId: 9999,
      notes: '   ',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.node).toEqual({ cidr: '10.0.0.0/8', name: 'Core' });
  });

  it('offers exactly eight palette tokens', () => {
    expect(PALETTE).toEqual(['blue', 'green', 'amber', 'red', 'violet', 'teal', 'pink', 'grey']);
  });
});

describe('normaliseProject', () => {
  it('quarantines a corrupt root instead of losing the project', () => {
    const stored = {
      ...createProject('Acme'),
      roots: [
        { cidr: '10.20.0.0/16' },
        { cidr: '10.0.0.0/8', children: [{ cidr: '10.0.0.0/9' }, { cidr: '11.0.0.0/9' }] },
      ],
    };

    const normalised = normaliseProject(stored);
    expect(normalised).toBeDefined();
    expect(normalised?.project.roots.map((node) => node.cidr)).toEqual(['10.20.0.0/16']);
    expect(normalised?.quarantined).toHaveLength(1);
    expect(normalised?.quarantined[0]?.cidr).toBe('10.0.0.0/8');
  });

  it('labels a quarantined root with no readable block', () => {
    const normalised = normaliseProject({ ...createProject('Acme'), roots: ['rubbish'] });
    expect(normalised?.quarantined[0]?.cidr).toBe('unknown block');
  });

  it.each([[null], ['nope'], [42], [{ id: 1 }], [{ name: 'x' }]])(
    'returns undefined for unusable stored data (%j)',
    (raw) => {
      expect(normaliseProject(raw)).toBeUndefined();
    },
  );

  it('repairs missing timestamps and optional fields', () => {
    const normalised = normaliseProject({ id: 'x', name: 'Acme', client: '  ', roots: [] });
    expect(normalised?.project.client).toBeUndefined();
    expect(typeof normalised?.project.createdAt).toBe('number');
    expect(normalised?.project.schemaVersion).toBe(1);
  });

  it('keeps client and notes when they carry content', () => {
    const normalised = normaliseProject({
      id: 'x',
      name: 'Acme',
      client: 'Acme Ltd',
      notes: 'Head office refresh',
      createdAt: 1,
      updatedAt: 2,
      roots: [],
    });
    expect(normalised?.project).toMatchObject({
      client: 'Acme Ltd',
      notes: 'Head office refresh',
      createdAt: 1,
      updatedAt: 2,
    });
  });
});

describe('createProject', () => {
  it('stamps an id, the schema version and timestamps', () => {
    const project = createProject('Acme refresh', { client: 'Acme Ltd', now: 1000 });
    expect(project.id).toMatch(/\S/);
    expect(project.schemaVersion).toBe(1);
    expect(project.createdAt).toBe(1000);
    expect(project.updatedAt).toBe(1000);
    expect(project.client).toBe('Acme Ltd');
    expect(project.roots).toEqual([]);
  });

  it('falls back to a placeholder name', () => {
    expect(createProject('   ').name).toBe('Untitled plan');
  });
});
