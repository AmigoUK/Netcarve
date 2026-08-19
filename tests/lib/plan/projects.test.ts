import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  HISTORY_LIMIT,
  initHistory,
  pushHistory,
  redo,
  replaceHistory,
  undo,
} from '@/src/lib/plan/history';
import { createProject } from '@/src/lib/plan/model';
import {
  addRoot,
  findProject,
  loadProjects,
  removeProject,
  removeRoot,
  replaceRoot,
  saveProjects,
  touch,
  upsertProject,
} from '@/src/lib/plan/projects';
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
});

afterEach(() => setStorageArea(undefined));

describe('addRoot (FR-PLAN-02)', () => {
  it('adds a root in canonical network form', () => {
    const result = addRoot(createProject('Acme'), '10.20.30.40/16', 5000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.roots).toEqual([{ cidr: '10.20.0.0/16' }]);
      expect(result.project.updatedAt).toBe(5000);
    }
  });

  it('accepts a second, disjoint root — including a different family', () => {
    const first = addRoot(createProject('Acme'), '10.20.0.0/16');
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = addRoot(first.project, '2001:db8::/48');
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.project.roots).toHaveLength(2);
  });

  it.each([
    ['an identical block', '10.20.0.0/16'],
    ['a block inside it', '10.20.1.0/24'],
    ['a block containing it', '10.0.0.0/8'],
  ])('refuses %s', (_label, candidate) => {
    const seeded = addRoot(createProject('Acme'), '10.20.0.0/16');
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) return;

    const result = addRoot(seeded.project, candidate);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('10.20.0.0/16');
  });

  it('reports a friendly parse error', () => {
    const result = addRoot(createProject('Acme'), '999.1.1.1/24');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/0 to 255/);
  });
});

describe('project list operations', () => {
  it('upserts, orders by most recently updated, finds and removes', () => {
    const older = { ...createProject('Older', { now: 1 }) };
    const newer = { ...createProject('Newer', { now: 2 }) };

    let list = upsertProject([], older);
    list = upsertProject(list, newer);
    expect(list.map((project) => project.name)).toEqual(['Newer', 'Older']);

    const updated = touch(older, 3);
    list = upsertProject(list, updated);
    expect(list.map((project) => project.name)).toEqual(['Older', 'Newer']);
    expect(list).toHaveLength(2);

    expect(findProject(list, older.id)?.name).toBe('Older');
    expect(findProject(list, 'missing')).toBeUndefined();

    list = removeProject(list, older.id);
    expect(list.map((project) => project.name)).toEqual(['Newer']);
  });

  it('replaces and removes a root by index', () => {
    let project = createProject('Acme', { roots: [{ cidr: '10.0.0.0/8' }, { cidr: '172.16.0.0/12' }] });
    project = replaceRoot(project, 1, { cidr: '172.16.0.0/12', name: 'Branches' }, 99);
    expect(project.roots[1]?.name).toBe('Branches');
    expect(project.roots[0]?.name).toBeUndefined();
    expect(project.updatedAt).toBe(99);

    project = removeRoot(project, 0);
    expect(project.roots.map((root) => root.cidr)).toEqual(['172.16.0.0/12']);
  });
});

describe('persistence', () => {
  it('round-trips projects through storage', async () => {
    const project = createProject('Acme', { client: 'Acme Ltd', roots: [{ cidr: '10.20.0.0/16' }] });
    expect(await saveProjects([project])).toBe(true);

    const loaded = await loadProjects();
    expect(loaded.projects).toHaveLength(1);
    expect(loaded.projects[0]?.name).toBe('Acme');
    expect(loaded.projects[0]?.roots[0]?.cidr).toBe('10.20.0.0/16');
    expect(loaded.quarantined).toEqual([]);
  });

  it('returns nothing when storage is empty or holds the wrong shape', async () => {
    expect(await loadProjects()).toEqual({ projects: [], quarantined: [] });
    await area.set(STORAGE_KEYS.projects, { not: 'an array' });
    expect(await loadProjects()).toEqual({ projects: [], quarantined: [] });
  });

  it('skips unusable entries and reports quarantined roots', async () => {
    await area.set(STORAGE_KEYS.projects, [
      'rubbish',
      {
        id: 'p1',
        name: 'Acme',
        roots: [
          { cidr: '10.20.0.0/16' },
          { cidr: '10.0.0.0/8', children: [{ cidr: '10.0.0.0/9' }, { cidr: '11.0.0.0/9' }] },
        ],
      },
    ]);

    const loaded = await loadProjects();
    expect(loaded.projects).toHaveLength(1);
    expect(loaded.projects[0]?.roots).toHaveLength(1);
    expect(loaded.quarantined[0]?.project).toBe('Acme');
    expect(loaded.quarantined[0]?.roots[0]?.cidr).toBe('10.0.0.0/8');
  });
});

describe('history (FR-PLAN-09)', () => {
  it('undoes and redoes', () => {
    let history = initHistory('a');
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);

    history = pushHistory(history, 'b');
    history = pushHistory(history, 'c');
    expect(history.present).toBe('c');
    expect(canUndo(history)).toBe(true);

    history = undo(history);
    expect(history.present).toBe('b');
    expect(canRedo(history)).toBe(true);

    history = undo(history);
    expect(history.present).toBe('a');
    expect(canUndo(history)).toBe(false);

    history = redo(history);
    expect(history.present).toBe('b');
    history = redo(history);
    expect(history.present).toBe('c');
    expect(canRedo(history)).toBe(false);
  });

  it('drops the redo stack once a new step is recorded', () => {
    let history = pushHistory(initHistory('a'), 'b');
    history = undo(history);
    history = pushHistory(history, 'z');
    expect(history.future).toEqual([]);
    expect(canRedo(history)).toBe(false);
  });

  it('keeps at least twenty steps', () => {
    let history = initHistory(0);
    for (let step = 1; step <= 25; step += 1) history = pushHistory(history, step);
    for (let step = 0; step < 25; step += 1) history = undo(history);
    expect(history.present).toBe(0);
  });

  it('bounds the stack', () => {
    let history = initHistory(0);
    for (let step = 1; step <= HISTORY_LIMIT + 10; step += 1) history = pushHistory(history, step);
    expect(history.past).toHaveLength(HISTORY_LIMIT);
  });

  it('replaces the present without recording a step', () => {
    const history = replaceHistory(initHistory('a'), 'a2');
    expect(history.present).toBe('a2');
    expect(canUndo(history)).toBe(false);
  });

  it('is a no-op at the ends', () => {
    const history = initHistory('a');
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });
});
