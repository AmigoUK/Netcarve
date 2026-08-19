/**
 * Links from the popup to the full-page app.
 *
 * `chrome.tabs.create` needs no permission, but the popup still falls back to `window.open`
 * so the same component works in a plain page during tests.
 */

interface ChromeLike {
  runtime?: { getURL?: (path: string) => string };
  tabs?: { create?: (options: { url: string }) => unknown };
}

function runtime(): ChromeLike | undefined {
  return (globalThis as { chrome?: ChromeLike }).chrome;
}

/** An absolute URL for an app route, e.g. `appUrl('/calc?q=10.0.0.0%2F8')`. */
export function appUrl(route: string): string {
  const base = runtime()?.runtime?.getURL?.('app.html') ?? 'app.html';
  return `${base}#${route}`;
}

/** Opens an app route in a new tab. */
export function openApp(route: string): void {
  const url = appUrl(route);
  const create = runtime()?.tabs?.create;
  if (create !== undefined) {
    create({ url });
    return;
  }
  globalThis.open?.(url, '_blank');
}
