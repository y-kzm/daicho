import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VenueData, VenueImport, WikicfpHit } from '../../src/shared/venues';
import type { Page } from '../../src/worker/venues/fetch-page';
import { loadWikicfpEvent, parseEvent, parseSearch, resetWikicfp, searchWikicfp, splitTitle } from '../../src/worker/venues/wikicfp';
import { call, type ErrorBody } from './request';

/** WikiCFP の検索結果と同じ形の HTML (内容は架空) */
const SEARCH = `<table><tr align="center" bgcolor="#bbbbbb"><td> Event </td><td> When </td><td> Where </td><td> Deadline</td></tr><tr bgcolor="#f6f6f6">
<td rowspan="2" align="left"><a href="/cfp/servlet/event.showcfp?eventid=1001&amp;copyownerid=5">IEEE FOO  2026</a></td>
<td align="left" colspan="3"> 1 2 3  IEEE Foo Communications &amp; Networking Conference 2026</td></tr>
<tr bgcolor="#f6f6f6">
<td align="left">Jan 9, 2026 - Jan 12, 2026</td>
<td align="left">Las Vegas, NV, USA</td>
<td align="left">Jul 1, 2025</td>
</tr>
<tr bgcolor="#e6e6e6">
<td rowspan="2" align="left"><a href="/cfp/servlet/event.showcfp?eventid=1002">FOO 2027</a></td>
<td align="left" colspan="3">Foo Conference</td></tr>
<tr bgcolor="#e6e6e6">
<td align="left">N/A</td>
<td align="left">N/A</td>
<td align="left">Jul 3, 2026 (Jun 26, 2026)</td>
</tr></table>`;

const EVENT = `<span property="v:summary" content="IEEE FOO  2026"></span>
<span property="v:eventType" content="Conference"></span>
<span property="v:startDate" content="2026-01-09T00:00:00"></span>
<span property="v:endDate" content="2026-01-12T23:59:59"></span>
<span rel="v:location"><span typeof="v:Address"><span property="v:locality" content="Las Vegas, NV, USA"></span></span></span>
<span property="v:description"> IEEE FOO   2026 :  1 2 3 4  IEEE Foo Communications &amp; Networking Conference 2026</span>
Link: <a href="https://foo2026.example.org/cfp" target="_newtab">https://foo2026.example.org/cfp</a>
<table><tr><th>Abstract Registration Due</th><td><span property="v:summary" content="Abstract Registration Due"></span>
<span property="v:startDate" content="2025-06-24T00:00:00">Jun 24, 2025</span></td></tr>
<tr><th>Submission Deadline</th><td><span property="v:summary" content="Submission Deadline"></span>
<span property="v:startDate" content="2025-07-01T00:00:00">Jul 1, 2025</span></td></tr>
<tr><th>Notification Due</th><td><span property="v:startDate" content="2025-07-31T00:00:00">Jul 31, 2025</span></td></tr>
<tr><th>Final Version Due</th><td><span property="v:startDate" content="TBD">TBD</span></td></tr></table>`;

const page = (text: string, status = 200): Page => ({ status, text, url: 'http://www.wikicfp.com/x' });

beforeEach(() => resetWikicfp(async () => undefined));

describe('parseSearch', () => {
  it('reads each pair of rows', () => {
    expect(parseSearch(SEARCH)).toEqual<WikicfpHit[]>([
      { eventId: 1001, title: 'IEEE FOO 2026', name: 'IEEE Foo Communications & Networking Conference 2026', when: 'Jan 9, 2026 - Jan 12, 2026', where: 'Las Vegas, NV, USA', deadline: 'Jul 1, 2025' },
      { eventId: 1002, title: 'FOO 2027', name: 'Foo Conference', when: 'N/A', where: 'N/A', deadline: 'Jul 3, 2026 (Jun 26, 2026)' },
    ]);
  });
  it('returns nothing for a page without results or with broken markup', () => {
    expect(parseSearch('<html><body>No results</body></html>')).toEqual([]);
    expect(parseSearch('')).toEqual([]);
    expect(parseSearch(SEARCH.slice(0, 300))).toEqual([]);
  });
  it('drops tags and keeps escaped characters as plain text', () => {
    // 画面は値を文字として表示するので、記号はそのまま持つ。タグとして書かれたものは、行の形に合わず読み飛ばす
    const escaped = SEARCH.replace('IEEE FOO  2026', 'A &lt;b&gt; 2026');
    expect(parseSearch(escaped)[0]!.title).toBe('A <b> 2026');
    const tagged = SEARCH.replace('IEEE FOO  2026', 'A <img src=x onerror=alert(1)> 2026');
    expect(parseSearch(tagged).map((h) => h.eventId)).toEqual([1002]);
  });
});

describe('splitTitle', () => {
  it('separates the organiser, the acronym and the year', () => {
    expect(splitTitle('IEEE CCNC 2026')).toEqual({ org: 'IEEE', acronym: 'CCNC', year: 2026 });
    expect(splitTitle('INFOCOM 2027')).toEqual({ org: '', acronym: 'INFOCOM', year: 2027 });
    expect(splitTitle('ACM/IEEE Foo 2026')).toMatchObject({ org: 'ACM', year: 2026 });
    expect(splitTitle('IEEE 2026')).toEqual({ org: '', acronym: 'IEEE', year: 2026 });
    expect(Number.isNaN(splitTitle('No year').year)).toBe(true);
  });
});

describe('parseEvent', () => {
  it('turns an event page into data to import', () => {
    const d = parseEvent(EVENT)!;
    expect(d.venue).toMatchObject({ kind: 'conference', acronym: 'FOO', org: 'IEEE', name: 'IEEE Foo Communications & Networking Conference', source: 'wikicfp', sourceKey: 'wikicfp/foo' });
    expect(d.editions).toHaveLength(1);
    expect(d.editions[0]).toMatchObject({ year: 2026, siteUrl: 'https://foo2026.example.org/cfp', place: 'Las Vegas, NV, USA', startDate: '2026-01-09', endDate: '2026-01-12', source: 'wikicfp' });
    expect(d.editions[0]!.deadlines.map((x) => [x.kind, x.dueLocal, x.timezone, x.source])).toEqual([
      ['abstract', '2025-06-24', 'AoE', 'wikicfp'], ['paper', '2025-07-01', 'AoE', 'wikicfp'], ['notification', '2025-07-31', 'AoE', 'wikicfp'],
    ]);
  });
  it('reads the organiser from the name when the title has none', () => {
    expect(parseEvent(EVENT.replace('content="IEEE FOO  2026"', 'content="FOO 2026"'))!.venue).toMatchObject({ acronym: 'FOO', org: 'IEEE' });
  });
  it('keeps only web links and readable dates', () => {
    const d = parseEvent(EVENT.replace('href="https://foo2026.example.org/cfp"', 'href="javascript:alert(1)"').replace('2026-01-09T00:00:00', 'soon'))!;
    expect(d.editions[0]).toMatchObject({ siteUrl: '', startDate: '' });
  });
  it('gives up on a page that is not an event', () => {
    expect(parseEvent('<html>Not found</html>')).toBeNull();
    expect(parseEvent(EVENT.replace('IEEE FOO  2026', 'IEEE FOO'))).toBeNull();
  });
});

describe('fetching', () => {
  it('asks once for the same search and waits between different ones', async () => {
    const waits: number[] = [];
    resetWikicfp(async (ms) => { waits.push(ms); });
    const urls: string[] = [];
    const fetcher = async (url: string) => { urls.push(url); return page(SEARCH); };
    let t = 1_000_000;
    const now = () => t;
    expect((await searchWikicfp('  foo   conf ', fetcher, now)).map((h) => h.title)).toEqual(['FOO 2027', 'IEEE FOO 2026']);
    await searchWikicfp('foo conf', fetcher, now);
    expect(urls).toEqual(['http://www.wikicfp.com/cfp/servlet/tool.search?q=foo%20conf&year=a']);
    expect(waits).toEqual([]);
    t += 1000;
    await searchWikicfp('bar', fetcher, now);
    await loadWikicfpEvent(1001, async (url) => { urls.push(url); return page(EVENT); }, now);
    expect(waits).toEqual([4000, 9000]);
    // 待ちが重なりすぎたら、待たせずに断る
    await expect(searchWikicfp('baz', fetcher, now)).rejects.toThrow(/少し待ってから/);
    t += 20_000;
    expect(urls[2]).toBe('http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=1001');
    t += 7 * 3600_000;
    await searchWikicfp('foo conf', fetcher, now);
    expect(urls).toHaveLength(4);
  });
  it('fetches once when the same search arrives twice at the same time', async () => {
    let n = 0;
    const fetcher = async () => { n++; await Promise.resolve(); return page(SEARCH); };
    const [a, b] = await Promise.all([searchWikicfp('foo', fetcher, () => 5), searchWikicfp('foo', fetcher, () => 5)]);
    expect(n).toBe(1);
    expect(a).toEqual(b);
  });
  it('reads a hostile page in a short time', () => {
    for (const html of ['<tr'.repeat(160_000), '<th'.repeat(160_000), '<td rowspan="2"'.repeat(30_000), 'property="v:summary" '.repeat(20_000), '<tr>' + ' '.repeat(400_000)]) {
      const t0 = Date.now();
      parseSearch(html);
      parseEvent(html);
      expect(Date.now() - t0, html.slice(0, 16)).toBeLessThan(1000);
    }
  });
  it('reports a failure and a page it cannot read', async () => {
    await expect(searchWikicfp('foo', async () => page('', 0))).rejects.toThrow(/WikiCFP から取得できません/);
    await expect(searchWikicfp('f', async () => page(SEARCH))).rejects.toThrow(/2 文字以上/);
    await expect(loadWikicfpEvent(9, async () => page('<html></html>'))).rejects.toThrow(/読み取れません/);
  });
});

describe('routes', () => {
  type Data = VenueData & ErrorBody & { summary?: { created: boolean; added: number; updated: number; kept: number } };
  const serve = () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);
      return new Response(url.includes('tool.search') ? SEARCH : url.includes('eventid=1001') ? EVENT : 'nope', { status: url.includes('eventid=404') ? 404 : 200 });
    }));
    return calls;
  };

  it('searches, reads an event and imports it as a conference', async () => {
    const calls = serve();
    const found = await call<{ hits: WikicfpHit[] } & ErrorBody>('GET', '/api/venues/wikicfp/search?q=foo');
    expect(found.status).toBe(200);
    expect(found.json.hits.map((h) => h.eventId)).toEqual([1002, 1001]);
    const ev = await call<VenueImport & ErrorBody>('GET', '/api/venues/wikicfp/events/1001');
    expect(ev.json.venue.acronym).toBe('FOO');
    expect(calls.every((u) => u.startsWith('http://www.wikicfp.com/cfp/servlet/'))).toBe(true);

    const r = await call<Data>('POST', '/api/venues/import', ev.json);
    expect(r.json.summary).toMatchObject({ created: true, added: 1 });
    expect(r.json.venues[0]).toMatchObject({ kind: 'conference', acronym: 'FOO', source: 'wikicfp', sourceKey: 'wikicfp/foo' });
    expect(r.json.venues[0]!.editions[0]!.deadlines.map((d) => d.source)).toEqual(['wikicfp', 'wikicfp', 'wikicfp']);
    const again = await call<Data>('POST', '/api/venues/import', ev.json);
    expect(again.json.summary).toMatchObject({ created: false, added: 0, updated: 1 });
    expect(again.json.venues).toHaveLength(1);
  });

  it('keeps conferences apart when they only share the acronym', async () => {
    serve();
    const foo = (await call<VenueImport & ErrorBody>('GET', '/api/venues/wikicfp/events/1001')).json;
    await call<Data>('POST', '/api/venues/import', foo);
    // 同じ会議の別の年 (名前の書き方が少し違う)
    const next = { venue: { ...foo.venue, name: 'The IEEE Foo Communications and Networking Conference (FOO)' }, editions: [{ ...foo.editions[0]!, year: 2027, startDate: '2027-01-09', endDate: '2027-01-12' }] };
    const r1 = await call<Data>('POST', '/api/venues/import', next);
    expect(r1.json.venues.map((v) => [v.sourceKey, v.editions.map((e) => e.year)])).toEqual([['wikicfp/foo', [2027, 2026]]]);
    // 略称は同じだが、別の会議
    const other = { venue: { ...foo.venue, name: 'International Conference on Formal Ontology Objects' }, editions: [{ ...foo.editions[0]!, year: 2025, startDate: '', endDate: '', deadlines: [] }] };
    const r2 = await call<Data>('POST', '/api/venues/import', other);
    expect(r2.json.summary).toMatchObject({ created: true, added: 1 });
    expect(r2.json.venues.map((v) => [v.sourceKey, v.name, v.editions.map((e) => e.year)]).sort()).toEqual([
      ['wikicfp/foo#2', 'International Conference on Formal Ontology Objects', [2025]],
      ['wikicfp/foo', 'The IEEE Foo Communications and Networking Conference (FOO)', [2027, 2026]],
    ]);
    expect((await call<Data>('POST', '/api/venues/import', { ...other, venue: { ...other.venue, sourceKey: 'wikicfp/foo#9' } })).status).toBe(400);
    const r3 = await call<Data>('POST', '/api/venues/import', other);
    expect(r3.json.summary).toMatchObject({ created: false, updated: 1 });
    expect(r3.json.venues).toHaveLength(2);
  });

  it('rejects a bad query, a bad id and a missing event', async () => {
    serve();
    expect((await call<ErrorBody>('GET', '/api/venues/wikicfp/search?q=')).status).toBe(400);
    expect((await call<ErrorBody>('GET', '/api/venues/wikicfp/events/abc')).status).toBe(400);
    expect((await call<ErrorBody>('GET', '/api/venues/wikicfp/events/404')).status).toBe(502);
  });
});
