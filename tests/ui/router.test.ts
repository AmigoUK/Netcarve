import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeQueryParam, navigate, parseRoute } from '@/src/ui/router';

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.location.hash = '';
});

describe('parseRoute', () => {
  it.each([
    ['#/calc', 'calc'],
    ['#/projects', 'projects'],
    ['#/vlsm', 'vlsm'],
    ['#/conflicts', 'conflicts'],
    ['#/settings', 'settings'],
    ['#/planner/abc', 'planner'],
    ['', 'calc'],
    ['#', 'calc'],
    ['#/', 'calc'],
    ['#/nonsense', 'calc'],
    ['/calc', 'calc'],
  ])('%s resolves to the %s route', (hash, name) => {
    expect(parseRoute(hash).name).toBe(name);
  });

  it('extracts the project id', () => {
    expect(parseRoute('#/planner/9f1e').params.projectId).toBe('9f1e');
    expect(parseRoute('#/planner/a%20b').params.projectId).toBe('a b');
    expect(parseRoute('#/planner').params.projectId).toBeUndefined();
  });

  it('parses the query string', () => {
    const route = parseRoute('#/calc?q=10.0.0.0%2F8&x=1');
    expect(route.query.get('q')).toBe('10.0.0.0/8');
    expect(route.query.get('x')).toBe('1');
  });

  it('normalises the path', () => {
    expect(parseRoute('#/calc?q=1').path).toBe('/calc');
    expect(parseRoute('#/planner/a b').path).toBe('/planner/a%20b');
  });
});

describe('consumeQueryParam (FR-CTX-04)', () => {
  it('returns the value and rewrites the URL without it', () => {
    const replaceState = vi.spyOn(globalThis.history, 'replaceState');
    const route = parseRoute('#/calc?q=fe80%3A%3A1');

    expect(consumeQueryParam(route, 'q')).toBe('fe80::1');
    expect(replaceState).toHaveBeenCalledWith(null, '', '#/calc');
  });

  it('keeps any other parameters', () => {
    const replaceState = vi.spyOn(globalThis.history, 'replaceState');
    consumeQueryParam(parseRoute('#/calc?q=1.1.1.1&keep=yes'), 'q');
    expect(replaceState).toHaveBeenCalledWith(null, '', '#/calc?keep=yes');
  });

  it('returns undefined when the parameter is absent', () => {
    const replaceState = vi.spyOn(globalThis.history, 'replaceState');
    expect(consumeQueryParam(parseRoute('#/calc'), 'q')).toBeUndefined();
    expect(replaceState).not.toHaveBeenCalled();
  });
});

describe('navigate', () => {
  it('sets the hash, adding the leading slash when it is missing', () => {
    navigate('/vlsm');
    expect(globalThis.location.hash).toBe('#/vlsm');
    navigate('conflicts');
    expect(globalThis.location.hash).toBe('#/conflicts');
  });
});
