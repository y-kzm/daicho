import { describe, expect, it } from 'vitest';
import { readStored, STORAGE_KEYS, writeStored, type StorageLike } from '../../src/web/lib/storage';

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
}

describe('storage', () => {
  it('round-trips JSON', () => {
    const s = memory();
    writeStored(s, 'k', { a: [1] });
    expect(readStored(s, 'k', null)).toEqual({ a: [1] });
  });
  it('returns the initial value for missing keys, broken JSON and no storage', () => {
    const s = memory();
    expect(readStored(s, 'x', 3)).toBe(3);
    s.data.set('bad', '{');
    expect(readStored(s, 'bad', 'd')).toBe('d');
    expect(readStored(null, 'x', 1)).toBe(1);
  });
  it('ignores storage errors', () => {
    const broken: StorageLike = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
    };
    expect(readStored(broken, 'k', 'i')).toBe('i');
    expect(() => writeStored(broken, 'k', 1)).not.toThrow();
  });
  it('names the keys', () => {
    expect(STORAGE_KEYS).toEqual({
      source: 'daicho.library.source',
      query: 'daicho.library.query',
      view: 'daicho.library.view',
      columns: 'daicho.library.columns',
      collapsed: 'daicho.library.groups.collapsed',
      detail: 'daicho.detail.open',
    });
  });
});
