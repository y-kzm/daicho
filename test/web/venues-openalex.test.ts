import { describe, expect, it } from 'vitest';
import { fromOpenAlex, toJournalHits } from '../../src/web/venues/openalex';
import { unlistedVenues } from '../../src/web/venues/suggest';
import { entry } from './helpers';

const ton = {
  id: 'https://openalex.org/S62238642', display_name: 'IEEE/ACM Transactions on Networking', issn_l: '1063-6692',
  host_organization_name: 'Institute of Electrical and Electronics Engineers', homepage_url: 'http://www.ton.seas.upenn.edu', works_count: 5271,
  alternate_titles: ['Networking', 'TON', 'Transactions on networking'],
};

describe('fromOpenAlex', () => {
  it('turns a source into a journal to import', () => {
    const hit = fromOpenAlex(ton)!;
    expect(hit).toMatchObject({ key: 'S62238642', name: 'IEEE/ACM Transactions on Networking', acronym: 'TON', publisher: 'IEEE', issn: '1063-6692', works: 5271 });
    expect(hit.data.editions).toEqual([]);
    expect(hit.data.venue).toMatchObject({
      kind: 'journal', acronym: 'TON', org: 'IEEE', issn: '1063-6692', siteUrl: 'http://www.ton.seas.upenn.edu', impactFactor: '', source: 'openalex', sourceKey: 'S62238642',
    });
  });
  it('drops values that are not in the expected form', () => {
    const hit = fromOpenAlex({ ...ton, issn_l: 'n/a', homepage_url: 'javascript:alert(1)', alternate_titles: ['Networking', 42, 'a very long alternative title'], host_organization_name: null, works_count: '9' })!;
    expect(hit).toMatchObject({ issn: '', acronym: '', publisher: '', works: 0 });
    expect(hit.data.venue).toMatchObject({ issn: '', siteUrl: '', org: '' });
  });
  it('skips records without a name or an id', () => {
    expect(fromOpenAlex({ ...ton, display_name: '' })).toBeNull();
    expect(fromOpenAlex({ ...ton, id: 'https://evil.example/S1' })).toBeNull();
    expect(fromOpenAlex({})).toBeNull();
  });
});

describe('toJournalHits', () => {
  it('reads the list and removes duplicates', () => {
    expect(toJournalHits({ results: [ton, ton, null, 'x', { id: 'https://openalex.org/S1', display_name: 'Computer Networks' }] }).map((h) => h.key)).toEqual(['S62238642', 'S1']);
    for (const bad of [null, {}, { results: 'x' }, 'text']) expect(toJournalHits(bad)).toEqual([]);
  });
});

describe('unlistedVenues by kind', () => {
  const es = [
    entry({ id: 1, journal: 'Computer Networks' }), entry({ id: 2, journal: 'Computer Networks' }), entry({ id: 3, conference: 'PAM 2020' }),
    entry({ id: 4, journal: 'IEEE/ACM Transactions on Networking' }),
  ];
  it('separates journals from conferences', () => {
    expect(unlistedVenues(es, [], 8, 'journal').map((u) => u.name)).toEqual(['Computer Networks', 'IEEE/ACM Transactions on Networking']);
    expect(unlistedVenues(es, [], 8, 'conference').map((u) => u.name)).toEqual(['PAM']);
    expect(unlistedVenues(es, [{ acronym: 'ToN', name: 'IEEE/ACM Transactions on Networking' }], 8, 'journal').map((u) => u.name)).toEqual(['Computer Networks']);
  });
});
