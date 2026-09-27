import { describe, expect, it } from 'vitest';
import { parseHash, toHash, type Route } from '../../src/web/lib/router';

describe('parseHash', () => {
  const cases: [string, Route][] = [
    ['', { name: 'library' }],
    ['#/library', { name: 'library' }],
    ['#/stats', { name: 'stats' }],
    ['#/project/12', { name: 'project', id: 12 }],
    ['#/project/0', { name: 'library' }],
    ['#/project/abc', { name: 'library' }],
    ['#/project/12/extra', { name: 'library' }],
    ['#/unknown', { name: 'library' }],
  ];
  it.each(cases)('%s', (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });
  it('toHash round-trips', () => {
    const routes: Route[] = [{ name: 'library' }, { name: 'stats' }, { name: 'project', id: 3 }];
    for (const r of routes) expect(parseHash(toHash(r))).toEqual(r);
    expect(toHash({ name: 'project', id: 3 })).toBe('#/project/3');
  });
});
