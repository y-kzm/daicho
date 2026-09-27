import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCoreQueries, fetchCoreRank, parseCoreCsv, parseCoreHtml, parseCsvLine, scoreCoreCandidate,
} from '../../src/worker/services/core-rank';
import { createHttp } from '../../src/worker/services/http';
import { mockFetch } from './fetch-mock';

const http = createHttp({});
afterEach(() => vi.unstubAllGlobals());

describe('buildCoreQueries', () => {
  it('prefers parenthesized acronym, then uppercase tokens, then cleaned name; short acronyms last', () => {
    expect(buildCoreQueries('TENCON 2025 - 2025 IEEE Region 10 Conference (TENCON)')).toEqual([
      'TENCON', 'TENCON IEEE Region 10 Conference', 'TENCON 2025 - 2025 IEEE Region 10 Conference (TENCON)',
    ]);
    const q = buildCoreQueries('IEEE Symposium on Security and Privacy (SP)');
    expect(q[0]).toBe('IEEE Symposium on Security and Privacy');
    expect(q[q.length - 1]).toBe('SP');
  });

  it('handles typographic apostrophe in year stripping', () => {
    expect(buildCoreQueries('Some Conference (Foobar ’26)')[0]).toBe('Foobar');
  });
});

describe('scoreCoreCandidate', () => {
  it('scores acronym and title containment', () => {
    const c = { title: 'IEEE Symposium on Security and Privacy', acronym: 'SP', source: 'CORE2023', rank: 'A*' };
    expect(scoreCoreCandidate(c, 'IEEE Symposium on Security and Privacy (SP)')).toBeGreaterThanOrEqual(6);
    expect(scoreCoreCandidate(c, 'Something Unrelated')).toBe(0);
    expect(scoreCoreCandidate({ ...c, acronym: 'S' }, 'S conference')).toBe(0);
  });
});

describe('CSV / HTML parsing', () => {
  it('parseCsvLine handles quotes', () => {
    expect(parseCsvLine('1,"A, B",X,"Y ""Z""",A*')).toEqual(['1', 'A, B', 'X', 'Y "Z"', 'A*']);
  });
  it('parseCoreCsv maps columns', () => {
    const body = '123,"ACM Internet Measurement Conference",IMC,CORE2023,A,yes\n\n124,"Other",OT,CORE2023,B,no\n';
    expect(parseCoreCsv(body)).toEqual([
      { title: 'ACM Internet Measurement Conference', acronym: 'IMC', source: 'CORE2023', rank: 'A' },
      { title: 'Other', acronym: 'OT', source: 'CORE2023', rank: 'B' },
    ]);
  });
  it('parseCoreHtml reads table rows', () => {
    const html = '<table><tr><td>Header</td></tr><tr><td><a>ACM IMC &amp; more</a></td><td>IMC</td><td>CORE2023</td><td>A</td><td>x</td></tr></table>';
    expect(parseCoreHtml(html)).toEqual([{ title: 'ACM IMC & more', acronym: 'IMC', source: 'CORE2023', rank: 'A' }]);
  });
});

describe('fetchCoreRank', () => {
  it('uses CSV export, sorts by score and stops at a confident match', async () => {
    const calls = mockFetch([
      { match: 'search=IMC&by=all&do=Export', body: '1,"Some Other Conference",SOC,CORE2023,C,yes\n2,"ACM Internet Measurement Conference",IMC,CORE2023,A,yes\n' },
    ]);
    const r = await fetchCoreRank(http, 'IMC');
    expect(r.query).toBe('IMC');
    expect(r.candidates[0]).toMatchObject({ acronym: 'IMC', rank: 'A' });
    expect(r.searchUrl).toContain('search=IMC');
    expect(calls.length).toBe(1);
  });

  it('falls back to HTML scraping when export returns HTML, and returns empty on nothing', async () => {
    mockFetch([
      { match: 'do=Export', body: '<html>blocked</html>' },
      { match: 'sort=atitle&page=1', body: '<tr><td>Foo Conf</td><td>FOO</td><td>CORE2023</td><td>B</td></tr>' },
    ]);
    const r = await fetchCoreRank(http, 'Foo Conf');
    expect(r.candidates[0]).toMatchObject({ title: 'Foo Conf', rank: 'B' });
    mockFetch([{ match: /.*/, body: '' }]);
    expect((await fetchCoreRank(http, 'Nothing Here')).candidates).toEqual([]);
  });

  it('rejects empty query', async () => {
    await expect(fetchCoreRank(http, '  ')).rejects.toThrow('カンファレンス名または略称を入力してください。');
  });
});
