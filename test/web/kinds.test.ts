import { describe, expect, it } from 'vitest';
import { KIND_GROUPS, ENTRY_KINDS } from '../../src/shared/types';
import { applyQuery, countFor, describeQuery, kindGroup, sameSource, sourceLabel, sourceQuery, toSavedQuery } from '../../src/web/lib/smart';
import { entry } from './helpers';

const now = new Date('2026-09-28T00:00:00');
const es = [
  entry({ id: 1, title: 'Paper', kind: 'paper' }),
  entry({ id: 2, title: 'RFC 8200', kind: 'rfc' }),
  entry({ id: 3, title: 'draft-x-00', kind: 'draft' }),
  entry({ id: 4, title: 'WP', kind: 'whitepaper' }),
  entry({ id: 5, title: 'Note', kind: 'other' }),
];

describe('kind groups', () => {
  it('cover every kind exactly once', () => {
    const all = KIND_GROUPS.flatMap((g) => [...g.kinds]);
    expect([...all].sort()).toEqual([...ENTRY_KINDS].sort());
    expect(new Set(all).size).toBe(all.length);
  });
  it('select the entries of their kinds', () => {
    const ids = (id: 'papers' | 'standards' | 'docs') => applyQuery(es, sourceQuery({ kind: 'kinds', id }, [], now), now).map((e) => e.id).sort();
    expect(ids('papers')).toEqual([1]);
    expect(ids('standards')).toEqual([2, 3]);
    expect(ids('docs')).toEqual([4, 5]);
    expect(countFor(es, {}, now)).toBe(5);
    expect(countFor(es, { kinds: [] }, now)).toBe(5);
  });
  it('have a label and compare by id', () => {
    expect(sourceLabel({ kind: 'kinds', id: 'standards' }, [])).toBe('標準文書 (RFC・I-D)');
    expect(sameSource({ kind: 'kinds', id: 'docs' }, { kind: 'kinds', id: 'docs' })).toBe(true);
    expect(sameSource({ kind: 'kinds', id: 'docs' }, { kind: 'kinds', id: 'papers' })).toBe(false);
    expect(sameSource({ kind: 'kinds', id: 'docs' }, { kind: 'builtin', id: 'all' })).toBe(false);
    expect(kindGroup('standards').kinds).toEqual(['rfc', 'draft']);
  });
  it('are kept in saved filters and described', () => {
    expect(toSavedQuery({ kinds: ['rfc'], search: '' })).toEqual({ kinds: ['rfc'] });
    expect(describeQuery({ kinds: ['rfc', 'draft'] }, () => undefined)).toEqual(['種類: RFC・Internet-Draft']);
  });
});

describe('columnsFor / defaultKind', () => {
  it('leaves the columns alone outside kind groups and for papers', async () => {
    const { columnsFor } = await import('../../src/web/lib/kinds');
    const stored = ['star', 'title', 'venue', 'core', 'read'] as const;
    expect(columnsFor([...stored], { kind: 'builtin', id: 'all' })).toEqual(stored);
    expect(columnsFor([...stored], { kind: 'kinds', id: 'papers' })).toEqual(stored);
  });
  it('swaps paper-only columns for the status in the other groups', async () => {
    const { columnsFor } = await import('../../src/web/lib/kinds');
    expect(columnsFor(['star', 'title', 'venue', 'core', 'read'], { kind: 'kinds', id: 'standards' })).toEqual(['star', 'title', 'read', 'status']);
    expect(columnsFor(['title', 'status', 'venue'], { kind: 'kinds', id: 'docs' })).toEqual(['title', 'status']);
  });
  it('picks the first kind of the open group for new entries', async () => {
    const { defaultKind, hasVenue, isIetf } = await import('../../src/web/lib/kinds');
    expect(defaultKind({ kind: 'kinds', id: 'standards' })).toBe('rfc');
    expect(defaultKind({ kind: 'kinds', id: 'docs' })).toBe('whitepaper');
    expect(defaultKind({ kind: 'tag', name: 'x' })).toBe('paper');
    expect([hasVenue('paper'), hasVenue('rfc'), isIetf('rfc'), isIetf('draft'), isIetf('whitepaper')]).toEqual([true, false, true, true, false]);
  });
});

describe('findRfc / fixedColumns / venueOf', () => {
  it('finds an RFC that is already registered under another entry', async () => {
    const { findRfc } = await import('../../src/web/lib/kinds');
    const list = [
      entry({ id: 1, doi: '10.17487/RFC8200', bibkey: 'x' }), entry({ id: 2, bibkey: 'rfc9602a' }),
      entry({ id: 3, bibkey: 'rfc96020' }), entry({ id: 4, bibkey: 'rfc9602bis' }),
    ];
    expect(findRfc(list, 8200, 99)?.id).toBe(1);
    expect(findRfc(list, 8200, 1)).toBeUndefined();
    expect(findRfc(list, 9602, 99)?.id).toBe(2);
    expect(findRfc(list, 960, 99)).toBeUndefined();
    expect(findRfc(list, 791, 99)).toBeUndefined();
  });
  it('takes the forced columns out of the chooser', async () => {
    const { fixedColumns } = await import('../../src/web/lib/kinds');
    expect(fixedColumns({ kind: 'builtin', id: 'all' })).toEqual([]);
    expect(fixedColumns({ kind: 'kinds', id: 'papers' })).toEqual([]);
    expect(fixedColumns({ kind: 'kinds', id: 'standards' })).toEqual(['venue', 'core', 'status']);
  });
  it('shows a venue for papers only', async () => {
    const { venueOf } = await import('../../src/web/lib/table');
    expect(venueOf(entry({ id: 1, conference: 'IMC' }))).toBe('IMC');
    expect(venueOf(entry({ id: 1, conference: 'IMC', journal: 'J', kind: 'whitepaper' }))).toBe('');
  });
});
