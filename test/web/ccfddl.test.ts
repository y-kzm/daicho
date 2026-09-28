import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { fromCcfddl, searchCatalog, toCatalog } from '../../src/web/venues/ccfddl';

// 公開データの実際の形 (conference/NW/imc.yml から抜粋)
const IMC = parse(`
- title: IMC
  description: ACM Internet Measurement Conference
  sub: NW
  rank:
    ccf: B
    core: A
    thcpl: A
  dblp: imc
  confs:
    - year: 2024
      id: imc24
      link: https://conferences.sigcomm.org/imc/2024/
      timeline:
        - abstract_deadline: '2024-05-08 23:59:59'
          deadline: '2024-05-15 23:59:59'
      timezone: AoE
      date: Nov 4-6, 2024
      place: Madrid, Spain
    - year: 2025
      id: imc25
      link: https://conferences.sigcomm.org/imc/2025/
      timeline:
        - abstract_deadline: '2024-11-14 23:59:59'
          deadline: '2024-11-21 23:59:59'
          comment: 'Fall deadline'
        - abstract_deadline: '2025-05-08 23:59:59'
          deadline: '2025-05-15 23:59:59'
          comment: 'Spring deadline'
      timezone: AoE
      date: Oct 28-31, 2025
      place: Madison, Wisconsin, USA
    - year: 2026
      id: imc26
      link: https://conferences.sigcomm.org/imc/2026/
      timeline:
        - deadline: TBD
      timezone: UTC-12
      date: TBD
      place: TBD
`) as unknown[];

describe('fromCcfddl', () => {
  it('maps a conference with several cycles', () => {
    const r = fromCcfddl(IMC[0] as never, 2026)!;
    expect(r.venue).toEqual({
      kind: 'conference', acronym: 'IMC', name: 'ACM Internet Measurement Conference', org: 'ACM', field: '', core: 'A', impactFactor: '',
      siteUrl: '', note: '', source: 'ccfddl', sourceKey: 'NW/imc',
    });
    expect(r.editions.map((e) => e.year)).toEqual([2026, 2025]);
    expect(r.editions[1]).toMatchObject({
      siteUrl: 'https://conferences.sigcomm.org/imc/2025/', place: 'Madison, Wisconsin, USA', dateText: 'Oct 28-31, 2025',
      startDate: '2025-10-28', endDate: '2025-10-31', estimated: false, source: 'ccfddl',
    });
    expect(r.editions[1]!.deadlines).toEqual([
      { kind: 'abstract', label: 'Fall deadline', dueLocal: '2024-11-14 23:59', timezone: 'AoE', estimated: false, source: 'ccfddl' },
      { kind: 'paper', label: 'Fall deadline', dueLocal: '2024-11-21 23:59', timezone: 'AoE', estimated: false, source: 'ccfddl' },
      { kind: 'abstract', label: 'Spring deadline', dueLocal: '2025-05-08 23:59', timezone: 'AoE', estimated: false, source: 'ccfddl' },
      { kind: 'paper', label: 'Spring deadline', dueLocal: '2025-05-15 23:59', timezone: 'AoE', estimated: false, source: 'ccfddl' },
    ]);
  });
  it('keeps an edition whose dates are not announced yet, without inventing dates', () => {
    const e = fromCcfddl(IMC[0] as never, 2026)!.editions[0]!;
    expect(e).toMatchObject({ year: 2026, dateText: 'TBD', startDate: '', endDate: '', place: 'TBD' });
    expect(e.deadlines).toEqual([]);
  });
  it('leaves out old years', () => {
    expect(fromCcfddl(IMC[0] as never, 2027)!.editions.map((e) => e.year)).toEqual([2026]);
    expect(fromCcfddl(IMC[0] as never, 2030)!.editions).toEqual([]);
  });
  it('is careful with odd values', () => {
    const odd = fromCcfddl({
      title: 'X', description: '', sub: 'SC', rank: { core: 'N' },
      confs: [
        { year: 2026, link: 'javascript:alert(1)', timezone: 'Mars', date: 12, timeline: [{ deadline: '2026-02-30 10:00:00' }, { deadline: '2026-03-01 10:00:00' }, 'x'] },
        { year: 2026, link: 'https://dup.example/' }, { year: 'soon' }, null, 'x',
      ],
    }, 2026)!;
    expect(odd.venue).toMatchObject({ name: 'X', core: '', org: '', sourceKey: 'SC/x' });
    expect(odd.editions).toHaveLength(1);
    expect(odd.editions[0]).toMatchObject({ siteUrl: '', dateText: '12', startDate: '' });
    expect(odd.editions[0]!.deadlines).toEqual([{ kind: 'paper', label: '', dueLocal: '2026-03-01 10:00', timezone: 'AoE', estimated: false, source: 'ccfddl' }]);
    expect(fromCcfddl({ description: 'No title' }, 2026)).toBeNull();
    expect(fromCcfddl({ title: 'Y', rank: null, confs: 'x' }, 2026)!.editions).toEqual([]);
  });
});

describe('toCatalog / searchCatalog', () => {
  const items = toCatalog([
    ...IMC,
    { title: 'SIGCOMM', description: 'ACM SIGCOMM Conference', sub: 'NW', rank: { core: 'A*' }, confs: [{ year: 2026 }] },
    { title: 'USS', description: 'USENIX Security Symposium', sub: 'SC', rank: { core: 'A*' }, confs: [] },
    { title: 'IMC', description: 'Duplicate', sub: 'NW' }, null, 'x',
  ], 2026);
  it('lists each conference once, by acronym', () => {
    expect(items.map((i) => [i.key, i.latestYear])).toEqual([['NW/imc', 2026], ['NW/sigcomm', 2026], ['SC/uss', 0]]);
    expect(toCatalog('not a list', 2026)).toEqual([]);
  });
  it('finds by acronym first, then by the full name', () => {
    expect(searchCatalog(items, 'imc').map((i) => i.acronym)).toEqual(['IMC']);
    expect(searchCatalog(items, 'usenix').map((i) => i.acronym)).toEqual(['USS']);
    expect(searchCatalog(items, 'acm').map((i) => i.acronym)).toEqual(['IMC', 'SIGCOMM']);
    expect(searchCatalog(items, 'S').map((i) => i.acronym)).toEqual(['SIGCOMM', 'USS', 'IMC']);
    expect(searchCatalog(items, '  ')).toHaveLength(3);
    expect(searchCatalog(items, 'zzz')).toEqual([]);
  });
});
