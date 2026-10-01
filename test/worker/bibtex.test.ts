import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../src/shared/types';
import { BIBTEX_MAX, buildManualBibtex, exportBibtex, generateBibkey, titleBibkey } from '../../src/worker/services/bibtex';
import { createHttp } from '../../src/worker/services/http';
import { mockFetch } from './fetch-mock';

const http = createHttp({});
afterEach(() => vi.unstubAllGlobals());

function entry(over: Partial<Entry>): Entry {
  return {
    id: 1, added: '2026-01-01', tags: [], title: 'A Study with IPv6', summary: '', url: '', doi: '', year: '2024',
    country: '', publisher: '', journal: '', impactFactor: '', conference: '', core: '', bibkey: '', read: '未読',
    note: '', starred: false, priority: 0, kind: 'paper', docStatus: '', lastOpenedAt: '', cites: {}, attachments: [], oa: { status: '', url: '', license: '', checkedAt: '' }, ...over,
  };
}

describe('generateBibkey', () => {
  it('uses Crossref first author family + year when DOI is present', async () => {
    mockFetch([{ match: 'api.crossref.org/works/', body: { message: { author: [{ family: 'Lencsés' }] } } }]);
    expect(await generateBibkey(http, { doi: '10.1/x', title: 'T', year: '2022' })).toBe('lencses2022');
  });
  it('falls back to the first significant title word', async () => {
    mockFetch([{ match: /.*/, status: 404, body: '' }]);
    expect(await generateBibkey(http, { doi: '10.1/x', title: 'A Study with IPv6 Things', year: '2024' })).toBe('study2024');
    expect(await generateBibkey(http, { doi: '', title: 'On the', year: '' })).toBe('paper');
  });
});

describe('titleBibkey', () => {
  it('derives key from title', () => {
    expect(titleBibkey({ title: 'A Study with IPv6', year: '2024' })).toBe('study2024');
    expect(titleBibkey({ title: 'On the', year: '' })).toBe('paper');
  });
});

describe('buildManualBibtex', () => {
  it('picks entry type and fields', () => {
    const bib = buildManualBibtex(entry({ bibkey: 'k1', conference: 'IMC', year: '2024', doi: '10.1/x', url: 'https://u' }));
    expect(bib).toContain('@inproceedings{k1,');
    expect(bib).toContain('booktitle = {IMC}');
    expect(bib).toContain('doi = {10.1/x}');
    expect(buildManualBibtex(entry({ bibkey: 'k2', journal: 'J' }))).toContain('@article{k2,');
    expect(buildManualBibtex(entry({ bibkey: 'k3' }))).toContain('@misc{k3,');
  });
  it('derives key from title when bibkey is empty', () => {
    const bib = buildManualBibtex(entry({ bibkey: '', title: 'A Study with IPv6', year: '2024' }));
    expect(bib).toContain('@misc{study2024,');
  });
});

describe('exportBibtex', () => {
  it('uses Crossref transform with the preferred key and falls back to manual', async () => {
    mockFetch([
      { match: '10.1%2Fok/transform/application/x-bibtex', body: '@article{Crossref_Key_2024,\n title={X}\n}' },
      { match: '10.1%2Fbad/transform', status: 404, body: '' },
    ]);
    const out = await exportBibtex(http, [
      entry({ id: 1, doi: '10.1/ok', bibkey: 'mine2024' }),
      entry({ id: 2, doi: '10.1/bad', bibkey: 'manual2024', journal: 'J' }),
      entry({ id: 3, bibkey: 'nodoi2024' }),
    ]);
    expect(out).toContain('@article{mine2024,');
    expect(out).toContain('@article{manual2024,');
    expect(out).toContain('@misc{nodoi2024,');
    expect(out.split('\n\n').length).toBe(3);
  });
  it('enforces limits', async () => {
    await expect(exportBibtex(http, [])).rejects.toThrow('対象のエントリがありません。');
    const many = Array.from({ length: BIBTEX_MAX + 1 }, (_, i) => entry({ id: i + 1 }));
    await expect(exportBibtex(http, many)).rejects.toThrow(`一度に出力できるのは ${BIBTEX_MAX} 件までです`);
  });
});

describe('buildManualBibtex by kind', () => {
  it('writes RFCs and drafts as technical reports with their number', () => {
    const rfc = buildManualBibtex(entry({ kind: 'rfc', bibkey: 'rfc791', title: 'RFC 791: Internet Protocol', year: '1981', publisher: 'RFC Editor (IETF)' }));
    expect(rfc).toContain('@techreport{rfc791,');
    expect(rfc).toContain('title = {Internet Protocol}');
    expect(rfc).toContain('type = {RFC}');
    expect(rfc).toContain('number = {791}');
    expect(rfc).toContain('institution = {RFC Editor}');
    expect(rfc).not.toContain('publisher');
    const draft = buildManualBibtex(entry({ kind: 'draft', bibkey: 'draft-ietf-6man-sids', title: 'draft-ietf-6man-sids-05: SRv6 SIDs', year: '2024' }));
    expect(draft).toContain('@techreport{draft-ietf-6man-sids,');
    expect(draft).toContain('title = {SRv6 SIDs}');
    expect(draft).toContain('type = {Internet-Draft}');
    expect(draft).toContain('number = {draft-ietf-6man-sids-05}');
  });
  it('keeps a title that has no number prefix, and omits an unknown number', () => {
    const bib = buildManualBibtex(entry({ kind: 'rfc', bibkey: 'ipv6spec', title: 'IPv6 Specification' }));
    expect(bib).toContain('title = {IPv6 Specification}');
    expect(bib).not.toContain('number = ');
  });
  it('writes white papers as misc and ignores venue values left from before', () => {
    const bib = buildManualBibtex(entry({ kind: 'whitepaper', bibkey: 'wp', title: 'State of IPv6', journal: 'Old Journal', conference: 'Old Conf', publisher: 'Example Networks' }));
    expect(bib).toContain('@misc{wp,');
    expect(bib).toContain('howpublished = {Example Networks}');
    expect(bib).not.toContain('Old Journal');
    expect(bib).not.toContain('Old Conf');
  });
  it('is unchanged for papers', () => {
    expect(buildManualBibtex(entry({ bibkey: 'k', conference: 'IMC', publisher: 'ACM' }))).toContain('@inproceedings{k,');
    expect(buildManualBibtex(entry({ bibkey: 'k', conference: 'IMC', publisher: 'ACM' }))).toContain('publisher = {ACM}');
  });
});
