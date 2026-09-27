import { describe, expect, it } from 'vitest';
import { parseHash, scopeOf, toHash, withScope, type Route } from '../../src/web/lib/router';

describe('parseHash', () => {
  const cases: [string, Route][] = [
    ['', { name: 'library' }],
    ['#/library', { name: 'library' }],
    ['#/stats', { name: 'stats' }],
    ['#/project/12', { name: 'project', id: 12 }],
    ['#/project/0', { name: 'library' }],
    ['#/project/abc', { name: 'library' }],
    ['#/project/12/extra', { name: 'library' }],
    ['#/project/12/library', { name: 'library', scope: 12 }],
    ['#/project/12/stats', { name: 'stats', scope: 12 }],
    ['#/project/0/library', { name: 'library' }],
    ['#/project/12/library/x', { name: 'library' }],
    ['#/unknown', { name: 'library' }],
  ];
  it.each(cases)('%s', (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });
  it('toHash round-trips', () => {
    const routes: Route[] = [
      { name: 'library' }, { name: 'stats' }, { name: 'project', id: 3 },
      { name: 'library', scope: 3 }, { name: 'stats', scope: 3 },
    ];
    for (const r of routes) expect(parseHash(toHash(r))).toEqual(r);
    expect(toHash({ name: 'project', id: 3 })).toBe('#/project/3');
  });
});

describe('scopeOf / withScope', () => {
  it('reads the project id from every scoped route', () => {
    expect(scopeOf({ name: 'library' })).toBeNull();
    expect(scopeOf({ name: 'stats' })).toBeNull();
    expect(scopeOf({ name: 'library', scope: 4 })).toBe(4);
    expect(scopeOf({ name: 'stats', scope: 4 })).toBe(4);
    expect(scopeOf({ name: 'project', id: 4 })).toBe(4);
  });
  it('keeps the kind of screen when the scope changes', () => {
    expect(withScope({ name: 'library' }, 2)).toEqual({ name: 'library', scope: 2 });
    expect(withScope({ name: 'stats', scope: 1 }, 2)).toEqual({ name: 'stats', scope: 2 });
    expect(withScope({ name: 'stats', scope: 1 }, null)).toEqual({ name: 'stats' });
    expect(withScope({ name: 'project', id: 1 }, 2)).toEqual({ name: 'project', id: 2 });
  });
  it('falls back to the list when leaving a board, since the whole library has no board', () => {
    expect(withScope({ name: 'project', id: 1 }, null)).toEqual({ name: 'library' });
    expect(toHash(withScope({ name: 'project', id: 1 }, null))).toBe('#/library');
  });
});
