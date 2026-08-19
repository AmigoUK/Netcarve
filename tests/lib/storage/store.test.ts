import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDebouncedWriter,
  readRaw,
  readValue,
  removeValue,
  setStorageArea,
  storageArea,
  STORAGE_KEYS,
  writeValue,
  WRITE_DEBOUNCE_MS,
  type StorageArea,
} from '@/src/lib/storage/store';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  normaliseSettings,
  saveSettings,
} from '@/src/lib/storage/settings';

/** A fake area that records calls and can be told to fail, standing in for a full quota. */
function fakeArea(): StorageArea & { data: Map<string, unknown>; failNext: boolean; sets: number } {
  const state = {
    data: new Map<string, unknown>(),
    failNext: false,
    sets: 0,
    async get(key: string) {
      return state.data.get(key);
    },
    async set(key: string, value: unknown) {
      state.sets += 1;
      if (state.failNext) throw new Error('QUOTA_BYTES quota exceeded');
      state.data.set(key, value);
    },
    async remove(key: string) {
      if (state.failNext) throw new Error('storage unavailable');
      state.data.delete(key);
    },
  };
  return state;
}

let area: ReturnType<typeof fakeArea>;

beforeEach(() => {
  area = fakeArea();
  setStorageArea(area);
});

afterEach(() => {
  setStorageArea(undefined);
  vi.useRealTimers();
});

describe('storageArea', () => {
  it('falls back to an in-memory area when chrome.storage is absent', async () => {
    setStorageArea(undefined);
    const memory = storageArea();
    expect(await memory.get(STORAGE_KEYS.calcLast)).toBeUndefined();
    await memory.set(STORAGE_KEYS.calcLast, '10.0.0.0/8');
    expect(await memory.get(STORAGE_KEYS.calcLast)).toBe('10.0.0.0/8');
    await memory.remove(STORAGE_KEYS.calcLast);
    expect(await memory.get(STORAGE_KEYS.calcLast)).toBeUndefined();
  });

  it('uses chrome.storage.local when it is present', async () => {
    setStorageArea(undefined);
    const store: Record<string, unknown> = {};
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          async get(key: string) {
            return { [key]: store[key] };
          },
          async set(items: Record<string, unknown>) {
            Object.assign(store, items);
          },
          async remove(key: string) {
            delete store[key];
          },
        },
      },
    };

    const chromeBacked = storageArea();
    await chromeBacked.set(STORAGE_KEYS.calcLast, '2001:db8::/48');
    expect(store[STORAGE_KEYS.calcLast]).toBe('2001:db8::/48');
    expect(await chromeBacked.get(STORAGE_KEYS.calcLast)).toBe('2001:db8::/48');
    await chromeBacked.remove(STORAGE_KEYS.calcLast);
    expect(store[STORAGE_KEYS.calcLast]).toBeUndefined();

    delete (globalThis as unknown as { chrome?: unknown }).chrome;
    setStorageArea(area);
  });
});

describe('readValue / writeValue / removeValue', () => {
  const isString = (value: unknown): value is string => typeof value === 'string';

  it('round-trips a value', async () => {
    expect(await writeValue(STORAGE_KEYS.calcLast, '10.0.0.0/8')).toBe(true);
    expect(await readValue(STORAGE_KEYS.calcLast, '', isString)).toBe('10.0.0.0/8');
    expect(await readRaw(STORAGE_KEYS.calcLast)).toBe('10.0.0.0/8');
  });

  it('falls back when the stored value fails validation', async () => {
    await writeValue(STORAGE_KEYS.calcLast, 42);
    expect(await readValue(STORAGE_KEYS.calcLast, 'fallback', isString)).toBe('fallback');
  });

  it('falls back when the area throws', async () => {
    setStorageArea({
      async get() {
        throw new Error('nope');
      },
      async set() {
        throw new Error('nope');
      },
      async remove() {
        throw new Error('nope');
      },
    });
    expect(await readValue(STORAGE_KEYS.calcLast, 'fallback', isString)).toBe('fallback');
    expect(await readRaw(STORAGE_KEYS.calcLast)).toBeUndefined();
    expect(await writeValue(STORAGE_KEYS.calcLast, 'x')).toBe(false);
    expect(await removeValue(STORAGE_KEYS.calcLast)).toBe(false);
  });

  it('removes a key', async () => {
    await writeValue(STORAGE_KEYS.calcLast, 'x');
    expect(await removeValue(STORAGE_KEYS.calcLast)).toBe(true);
    expect(await readRaw(STORAGE_KEYS.calcLast)).toBeUndefined();
  });
});

describe('createDebouncedWriter', () => {
  it('coalesces rapid edits into a single write', async () => {
    vi.useFakeTimers();
    const writer = createDebouncedWriter(STORAGE_KEYS.calcLast);

    writer.queue('a');
    writer.queue('b');
    writer.queue('c');
    expect(writer.pending()).toBe(true);
    expect(area.sets).toBe(0);

    await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS);
    expect(area.sets).toBe(1);
    expect(area.data.get(STORAGE_KEYS.calcLast)).toBe('c');
    expect(writer.pending()).toBe(false);
  });

  it('writes immediately on flush', async () => {
    vi.useFakeTimers();
    const writer = createDebouncedWriter(STORAGE_KEYS.calcLast);
    writer.queue('now');
    await writer.flush();
    expect(area.data.get(STORAGE_KEYS.calcLast)).toBe('now');
  });

  it('does nothing when flushed with no queued value', async () => {
    const writer = createDebouncedWriter(STORAGE_KEYS.calcLast);
    await writer.flush();
    expect(area.sets).toBe(0);
  });

  it('reports a quota failure instead of throwing (FR-STOR-02)', async () => {
    const onError = vi.fn();
    const writer = createDebouncedWriter(STORAGE_KEYS.projects, onError);
    area.failNext = true;
    writer.queue([{ id: 'x' }]);
    await writer.flush();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('settings', () => {
  it('starts from the documented defaults', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      schemaVersion: 1,
      theme: 'auto',
      allowSlash31: false,
      exportFooter: true,
      defaultCopyFormat: 'markdown',
    });
  });

  it('round-trips a saved change', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark', allowSlash31: true });
    const loaded = await loadSettings();
    expect(loaded.theme).toBe('dark');
    expect(loaded.allowSlash31).toBe(true);
  });

  it.each([
    [null],
    ['nonsense'],
    [42],
    [{ theme: 'neon', allowSlash31: 'yes', defaultCopyFormat: 'xml', exportFooter: 1 }],
  ])('replaces unusable stored settings (%j) with defaults', (raw) => {
    expect(normaliseSettings(raw)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps a recognised value while repairing the rest', () => {
    expect(normaliseSettings({ theme: 'light', defaultCopyFormat: 'plain', bogus: true })).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'light',
      defaultCopyFormat: 'plain',
    });
  });

  it('always stamps the current schema version', () => {
    expect(normaliseSettings({ schemaVersion: 99 }).schemaVersion).toBe(1);
  });
});
