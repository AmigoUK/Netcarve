/**
 * A thin, typed wrapper over `chrome.storage.local`.
 *
 * Writes are debounced (FR-STOR-01) and every stored value carries its own `schemaVersion`.
 * A quota failure never throws into the UI: the failure is handed to a callback so the view
 * can raise a toast and carry on working from memory (FR-STOR-02).
 *
 * Outside an extension page — unit tests, or a stray import in a plain browser tab — the
 * module falls back to an in-memory area, so nothing has to guard for `chrome` being absent.
 */

export const STORAGE_KEYS = {
  projects: 'netcarve:projects',
  settings: 'netcarve:settings',
  calcLast: 'netcarve:calcLast',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** The write debounce, in milliseconds (FR-STOR-01, FR-PLAN-08). */
export const WRITE_DEBOUNCE_MS = 500;

export interface StorageArea {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

interface ChromeLike {
  storage?: {
    local?: {
      get(keys: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    };
  };
}

function memoryArea(): StorageArea {
  const map = new Map<string, string>();
  return {
    async get(key) {
      const raw = map.get(key);
      return raw === undefined ? undefined : (JSON.parse(raw) as unknown);
    },
    async set(key, value) {
      map.set(key, JSON.stringify(value));
    },
    async remove(key) {
      map.delete(key);
    },
  };
}

function chromeArea(local: NonNullable<NonNullable<ChromeLike['storage']>['local']>): StorageArea {
  return {
    async get(key) {
      const result = await local.get(key);
      return result[key];
    },
    async set(key, value) {
      await local.set({ [key]: value });
    },
    async remove(key) {
      await local.remove(key);
    },
  };
}

let area: StorageArea | undefined;

/** The active storage area — `chrome.storage.local` when available, memory otherwise. */
export function storageArea(): StorageArea {
  if (area === undefined) {
    const runtime = (globalThis as { chrome?: ChromeLike }).chrome;
    const local = runtime?.storage?.local;
    area = local === undefined ? memoryArea() : chromeArea(local);
  }
  return area;
}

/** Replaces the storage area. Tests use this to inject a fake or a failing area. */
export function setStorageArea(next: StorageArea | undefined): void {
  area = next;
}

/** Reads a stored value without interpreting it. Never rejects. */
export async function readRaw(key: StorageKey): Promise<unknown> {
  try {
    return await storageArea().get(key);
  } catch {
    return undefined;
  }
}

/**
 * Reads a stored value, falling back when the key is missing, unreadable, or fails the
 * caller's own validation. Storage is user-editable in principle, so nothing here trusts it.
 */
export async function readValue<T>(
  key: StorageKey,
  fallback: T,
  validate: (value: unknown) => value is T,
): Promise<T> {
  try {
    const raw = await storageArea().get(key);
    return validate(raw) ? raw : fallback;
  } catch {
    return fallback;
  }
}

/** Writes a value immediately. Resolves to `false` when the write failed. */
export async function writeValue(key: StorageKey, value: unknown): Promise<boolean> {
  try {
    await storageArea().set(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Removes a key. Resolves to `false` when the removal failed. */
export async function removeValue(key: StorageKey): Promise<boolean> {
  try {
    await storageArea().remove(key);
    return true;
  } catch {
    return false;
  }
}

export interface DebouncedWriter {
  /** Queues a value; the newest value wins. */
  queue(value: unknown): void;
  /** Writes any queued value now and resolves once it has landed. */
  flush(): Promise<void>;
  /** True while a write is queued but not yet written. */
  pending(): boolean;
}

/**
 * Creates a writer that coalesces rapid edits into one write every {@link WRITE_DEBOUNCE_MS}.
 * `onError` is called instead of throwing when the underlying write fails.
 */
export function createDebouncedWriter(
  key: StorageKey,
  onError?: (error: unknown) => void,
  delay: number = WRITE_DEBOUNCE_MS,
): DebouncedWriter {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queued: { value: unknown } | undefined;

  async function write(): Promise<void> {
    if (queued === undefined) return;
    const { value } = queued;
    queued = undefined;
    try {
      await storageArea().set(key, value);
    } catch (error) {
      onError?.(error);
    }
  }

  return {
    queue(value) {
      queued = { value };
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void write();
      }, delay);
    },
    async flush() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      await write();
    },
    pending() {
      return queued !== undefined;
    },
  };
}
