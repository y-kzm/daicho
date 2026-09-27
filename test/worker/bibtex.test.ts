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
    note: '', starred: false, priority: 0, lastOpenedAt: '', cites: {}, attachments: [], ...over,
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
