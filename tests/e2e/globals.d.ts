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
  runtime: {
    getURL(path: string): string;
    id: string;
    lastError?: { message?: string };
  };
  contextMenus: {
    create(
      properties: { id: string; title: string; contexts: string[] },
      callback?: () => void,
    ): void;
    update(
      id: string,
      properties: { title?: string; contexts?: string[] },
      callback?: () => void,
    ): void;
  };
  tabs: { create(options: { url: string }): Promise<unknown> };
};
