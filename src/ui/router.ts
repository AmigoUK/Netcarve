/**
 * A hash router small enough to read in one sitting.
 *
 * Routes: `#/calc`, `#/projects`, `#/planner/:projectId`, `#/vlsm`, `#/conflicts`,
 * `#/settings`. Anything unrecognised falls back to the calculator.
 */

import { useEffect, useState } from 'preact/hooks';

export type RouteName =
  | 'calc'
  | 'projects'
  | 'planner'
  | 'vlsm'
  | 'conflicts'
  | 'tools'
  | 'settings';

export interface Route {
  readonly name: RouteName;
  /** Path segments after the route name, e.g. the project id for `#/planner/:projectId`. */
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  /** The normalised route without the leading `#`, e.g. `/planner/abc`. */
  readonly path: string;
}

const ROUTE_NAMES: readonly RouteName[] = [
  'calc',
  'projects',
  'planner',
  'vlsm',
  'conflicts',
  'tools',
  'settings',
];

/** Parses a location hash into a route. Pure, so it is trivial to test. */
export function parseRoute(hash: string): Route {
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const [pathPart = '', queryPart = ''] = withoutHash.split('?');
  const segments = pathPart.split('/').filter((segment) => segment !== '');
  const head = segments[0];
  const name = (ROUTE_NAMES as readonly string[]).includes(head ?? '')
    ? (head as RouteName)
    : 'calc';

  const params: Record<string, string> = {};
  if (name === 'planner' && segments[1] !== undefined) {
    params.projectId = decodeURIComponent(segments[1]);
  }

  const path = name === 'planner' && params.projectId !== undefined
    ? `/planner/${encodeURIComponent(params.projectId)}`
    : `/${name}`;

  return { name, params, query: new URLSearchParams(queryPart), path };
}

/** Navigates by setting the hash; the `hashchange` listener does the rest. */
export function navigate(path: string): void {
  globalThis.location.hash = path.startsWith('/') ? path : `/${path}`;
}

/**
 * Reads several query parameters at once and rewrites the URL without them, so a refresh does
 * not re-trigger the action (FR-CTX-04).
 *
 * Taking them together matters: consuming one at a time would rebuild the URL from the
 * original query each time and put the earlier parameter back.
 */
export function consumeQueryParams(
  route: Route,
  keys: readonly string[],
): Record<string, string | undefined> {
  const taken: Record<string, string | undefined> = {};
  const remaining = new URLSearchParams(route.query);
  let found = false;

  for (const key of keys) {
    const value = route.query.get(key);
    if (value === null) continue;
    taken[key] = value;
    remaining.delete(key);
    found = true;
  }

  if (found) {
    const suffix = remaining.toString();
    globalThis.history?.replaceState?.(null, '', `#${route.path}${suffix === '' ? '' : `?${suffix}`}`);
  }
  return taken;
}

/** The single-parameter case, which is what the context menu needs. */
export function consumeQueryParam(route: Route, key: string): string | undefined {
  return consumeQueryParams(route, [key])[key];
}

/** The current route, kept in step with the address bar. */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(globalThis.location?.hash ?? ''));

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(globalThis.location.hash));
    globalThis.addEventListener('hashchange', onChange);
    return () => globalThis.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
