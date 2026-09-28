import { describe, expect, it } from 'vitest';
import type { Venue, VenueDeadline, VenueEdition } from '../../src/shared/venues';
import { addDays, calendarItems, itemsBetween, layoutWeek, monthWeeks, shiftMonth, type CalItem } from '../../src/web/venues/calendar';
import { searchCatalog, type CatalogItem } from '../../src/web/venues/ccfddl';
import { nextHeld } from '../../src/web/venues/format';
import { libraryCounts, unlistedVenues } from '../../src/web/venues/suggest';
import { entry } from './helpers';

const deadline = (over: Partial<VenueDeadline> = {}): VenueDeadline => ({
  id: 1, kind: 'paper', label: '', dueLocal: '2026-05-15 23:59', timezone: 'AoE', estimated: false, source: 'manual', ...over,
});
const edition = (over: Partial<VenueEdition> = {}): VenueEdition => ({
  id: 1, year: 2026, label: '', siteUrl: '', place: '', dateText: '', startDate: '2026-10-26', endDate: '2026-10-30',
  estimated: false, source: 'manual', note: '', deadlines: [deadline()], ...over,
});
const venue = (over: Partial<Venue> = {}): Venue => ({
  id: 1, kind: 'conference', acronym: 'IMC', name: 'Internet Measurement Conference', org: '', field: '', core: '', impactFactor: '',
  siteUrl: '', note: '', source: 'manual', sourceKey: '', archived: false, editions: [edition()], ...over,
});
/** 日本時間の日付 */
const jst = (d: Date): string => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
const item = (key: string, start: string, end = start): CalItem => ({ key, venueId: 1, kind: end === start ? 'deadline' : 'held', title: key, short: key, start, end, estimated: false, at: null });

describe('monthWeeks / shiftMonth / addDays', () => {
  it('lays out a month from Monday', () => {
    const w = monthWeeks(2026, 10);
    expect(w).toHaveLength(5);
    expect(w[0]).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(w[4]![6]).toBe('2026-11-01');
    expect(monthWeeks(2026, 2)[0]![6]).toBe('2026-02-01'); // 日曜から始まる月は、最初の週の最後に 1 日が来る
    expect(monthWeeks(2027, 2)).toHaveLength(4); // 月曜から始まる 28 日の月
    expect(monthWeeks(2026, 3)).toHaveLength(6);
    expect(monthWeeks(2024, 2).flat()).toContain('2024-02-29');
  });
  it('moves across years', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 5, -17)).toEqual({ year: 2024, month: 12 });
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('calendarItems', () => {
  it('puts a deadline on the local day and an edition on its range', () => {
    const items = calendarItems([venue()], jst);
    expect(items.map((i) => [i.kind, i.title, i.start, i.end])).toEqual([
      ['deadline', 'IMC 2026 論文締切', '2026-05-16', '2026-05-16'], // AoE の 5/15 23:59 は、日本では 5/16 20:59
      ['held', 'IMC 2026 開催', '2026-10-26', '2026-10-30'],
    ]);
  });
  it('skips archived venues and unreadable dates, and keeps estimates marked', () => {
    expect(calendarItems([venue({ archived: true })], jst)).toEqual([]);
    const v = venue({ editions: [edition({ startDate: '', endDate: '', estimated: true, deadlines: [deadline({ dueLocal: 'soon' }), deadline({ id: 2, dueLocal: '2026-04-01', timezone: 'UTC+9', estimated: true })] })] });
    expect(calendarItems([v], jst).map((i) => [i.start, i.estimated])).toEqual([['2026-04-01', true]]);
  });
  it('treats an end before the start as one day', () => {
    const v = venue({ editions: [edition({ endDate: '2026-10-01', deadlines: [] })] });
    expect(calendarItems([v], jst)[0]).toMatchObject({ start: '2026-10-26', end: '2026-10-26' });
  });
});

describe('layoutWeek', () => {
  const week = monthWeeks(2026, 10)[4]!; // 10/26 (月) から 11/1 (日)
  it('places ranges and single days without overlap', () => {
    const segs = layoutWeek(week, [item('held', '2026-10-26', '2026-10-30'), item('a', '2026-10-27'), item('b', '2026-10-31'), item('c', '2026-10-27')]);
    expect(segs.map((s) => [s.item.key, s.from, s.to, s.lane])).toEqual([['held', 0, 4, 0], ['a', 1, 1, 1], ['c', 1, 1, 2], ['b', 5, 5, 0]]);
  });
  it('cuts a range at the edges of the week', () => {
    const [s] = layoutWeek(week, [item('long', '2026-10-20', '2026-11-05')]);
    expect(s).toMatchObject({ from: 0, to: 6, before: true, after: true });
    const [t] = layoutWeek(week, [item('tail', '2026-10-20', '2026-10-27')]);
    expect(t).toMatchObject({ from: 0, to: 1, before: true, after: false });
    expect(layoutWeek(week, [item('x', '2026-10-25'), item('y', '2026-11-02')])).toEqual([]);
  });
  it('finds what falls in a month', () => {
    const items = [item('a', '2026-09-30'), item('b', '2026-09-29', '2026-10-02'), item('c', '2026-10-31'), item('d', '2026-11-01')];
    expect(itemsBetween(items, '2026-10-01', '2026-10-31').map((i) => i.key)).toEqual(['b', 'c']);
  });
});

describe('nextHeld', () => {
  it('picks the nearest edition that has not ended', () => {
    const v = venue({ editions: [
      edition({ id: 3, year: 2027, startDate: '2027-10-25', endDate: '2027-10-29' }), edition({ id: 2, year: 2026 }),
      edition({ id: 1, year: 2025, startDate: '2025-10-28', endDate: '2025-10-31' }), edition({ id: 4, year: 2028, startDate: '', endDate: '' }),
    ] });
    expect(nextHeld(v, '2026-09-28')?.id).toBe(2);
    expect(nextHeld(v, '2026-10-30')?.id).toBe(2); // 開催中
    expect(nextHeld(v, '2026-10-31')?.id).toBe(3);
    expect(nextHeld(v, '2028-01-01')).toBeNull();
    expect(nextHeld(venue({ editions: [edition({ startDate: '2026-10-10', endDate: '2026-10-01' })] }), '2026-10-05')?.id).toBe(1);
  });
});

describe('suggestions from the library', () => {
  const cat = (acronym: string, name: string): CatalogItem => ({
    key: 'NW/' + acronym.toLowerCase(), acronym, name, sub: 'NW', core: '', latestYear: 2026,
    data: { venue: { kind: 'conference', acronym, name, org: '', field: '', core: '', impactFactor: '', siteUrl: '', note: '', source: 'ccfddl', sourceKey: 'NW/' + acronym.toLowerCase() }, editions: [] },
  });
  const catalog = [cat('AAAI', 'AAAI Conference on Artificial Intelligence'), cat('DATE', 'Design, Automation and Test in Europe'), cat('IMC', 'Internet Measurement Conference'),
    cat('NSDI', 'Symposium on Networked Systems Design and Implementation'), cat('SIGCOMM', 'ACM SIGCOMM Conference'), cat('SP', 'IEEE Symposium on Security and Privacy')];
  const entries = [
    entry({ id: 1, conference: "IMC '23" }), entry({ id: 2, conference: 'ACM Internet Measurement Conference 2024' }), entry({ id: 3, conference: 'Proc. of IMC 2022' }),
    entry({ id: 4, conference: 'Sigcomm 2021' }), entry({ id: 5, conference: 'NSDI' }), entry({ id: 6, conference: 'NSDI 2020' }),
    entry({ id: 7, conference: 'ASPLOS' }), entry({ id: 8, journal: 'IEEE/ACM Transactions on Networking' }), entry({ id: 9, journal: 'IEEE/ACM Transactions on Networking' }),
    entry({ id: 10, journal: 'Up to date networking' }), entry({ id: 11, conference: 'PAM 2019' }), entry({ id: 12 }),
    entry({ id: 13, kind: 'rfc', conference: 'IMC' }),
  ];

  it('counts the papers of each conference', () => {
    expect([...libraryCounts(catalog, entries)]).toEqual([['NW/imc', 3], ['NW/nsdi', 2], ['NW/sigcomm', 1]]);
  });
  it('does not take an ordinary word for an acronym', () => {
    const more = [...catalog, cat('Networking', 'IFIP Networking Conference'), cat('CLOUD', 'IEEE International Conference on Cloud Computing')];
    const es = [...entries, entry({ id: 20, conference: 'ACM Symposium on Cloud Computing' }), entry({ id: 21, conference: 'IEEE CLOUD 2022' }), entry({ id: 22, conference: 'IFIP Networking 2023' })];
    const counts = libraryCounts(more, es);
    expect(counts.get('NW/networking')).toBe(1);
    expect(counts.get('NW/cloud')).toBe(1);
    expect(counts.get('NW/sigcomm')).toBe(1); // Sigcomm 2021 は、会議名が短いので数える
  });
  it('leaves out preprints and merges different spellings', () => {
    const es = [
      entry({ id: 1, journal: 'arXiv preprint arXiv:2301.00001' }), entry({ id: 2, journal: 'arXiv preprint arXiv:2302.00002' }), entry({ id: 3, journal: 'CoRR' }),
      entry({ id: 4, conference: 'In Proceedings of the 2023 ACM Foo Conference' }), entry({ id: 5, conference: 'ACM Foo Conference' }), entry({ id: 6, conference: "Bar ('23)" }),
    ];
    expect(unlistedVenues(es, [])).toEqual([{ name: 'ACM Foo Conference', kind: 'conference', papers: 2 }, { name: 'Bar', kind: 'conference', papers: 1 }]);
    const odd = [entry({ id: 1, journal: 'Proceedings of the IEEE' }), entry({ id: 2, journal: 'The Lancet' }), entry({ id: 3, journal: 'In Silico Biology' }), entry({ id: 4, conference: 'In: Proc. of the Foo Workshop' })];
    expect(unlistedVenues(odd, []).map((u) => u.name)).toEqual(['Foo Workshop', 'In Silico Biology', 'Proceedings of the IEEE', 'The Lancet']);
    expect(libraryCounts([cat('CoRR', 'Computing Research Repository')], es).size).toBe(0);
  });
  it('lists conferences of the library first', () => {
    const counts = libraryCounts(catalog, entries);
    expect(searchCatalog(catalog, '', 4, counts).map((c) => c.acronym)).toEqual(['IMC', 'NSDI', 'SIGCOMM', 'AAAI']);
    expect(searchCatalog(catalog, 's', 9, counts).map((c) => c.acronym)).toEqual(['SIGCOMM', 'SP', 'NSDI', 'IMC', 'DATE']);
    expect(searchCatalog(catalog, 'imc', 9).map((c) => c.acronym)).toEqual(['IMC']);
  });
  it('offers venues that the public data does not have', () => {
    expect(unlistedVenues(entries, catalog)).toEqual([
      { name: 'IEEE/ACM Transactions on Networking', kind: 'journal', papers: 2 },
      { name: 'ASPLOS', kind: 'conference', papers: 1 }, { name: 'PAM', kind: 'conference', papers: 1 },
      { name: 'Up to date networking', kind: 'journal', papers: 1 },
    ]);
    const tracked = [{ acronym: 'ToN', name: 'IEEE/ACM Transactions on Networking' }, { acronym: 'PAM', name: 'Passive and Active Measurement' }];
    expect(unlistedVenues(entries, [...catalog, ...tracked]).map((u) => u.name)).toEqual(['ASPLOS', 'Up to date networking']);
    expect(unlistedVenues(entries, catalog, 1)).toHaveLength(1);
  });
});
