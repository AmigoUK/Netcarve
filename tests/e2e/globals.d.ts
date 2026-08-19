/** `chrome` is present inside every extension page the E2E suite evaluates in. */
declare const chrome: {
  storage: {
    local: {
      get(keys: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    };
  };
  runtime: { getURL(path: string): string; id: string };
  contextMenus: unknown;
  tabs: { create(options: { url: string }): Promise<unknown> };
};
