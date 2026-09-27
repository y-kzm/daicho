import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAbstract, fetchAbstractFromPage, resolveAbstract } from '../../src/worker/services/abstract';
import { createHttp } from '../../src/worker/services/http';
import { mockFetch } from './fetch-mock';

const http = createHttp({});
const LONG = 'This is a sufficiently long abstract text that exceeds eighty characters for the threshold check. '.repeat(2);
afterEach(() => vi.unstubAllGlobals());

describe('fetchAbstract', () => {
  it('Crossref abstract with JATS tags stripped', async () => {
    mockFetch([{ match: 'api.crossref.org/works/', body: { message: { abstract: '<jats:p>Hello  <b>world</b></jats:p>' } } }]);
    expect(await fetchAbstract(http, '10.1/a')).toEqual({ text: 'Hello world', source: 'Crossref' });
  });
  it('falls through Crossref → DataCite → Semantic Scholar → OpenAlex → page', async () => {
    mockFetch([
      { match: 'api.crossref.org', body: { message: {} } },
      { match: 'api.datacite.org', body: { data: { attributes: { descriptions: [{ description: 'short' }] } } } },
      { match: 'api.semanticscholar.org', status: 429, body: '' },
      { match: 'api.openalex.org/works/doi:', body: { abstract_inverted_index: { world: [1], Hello: [0] } } },
    ]);
    expect(await fetchAbstract(http, '10.1/b')).toEqual({ text: 'Hello world', source: 'OpenAlex' });
  });
  it('uses the doi.org landing page as last resort', async () => {
    mockFetch([
      { match: /api\./, status: 404, body: '' },
      { match: 'doi.org/10.1/c', body: `<meta name="citation_abstract" content="${LONG}">` },
    ]);
    const r = await fetchAbstract(http, '10.1/c');
    expect(r.source).toBe('論文ページ');
    expect(r.text.length).toBeGreaterThan(80);
  });
});

describe('fetchAbstractFromPage', () => {
  it('reads Springer Abs1-content and rejects short noise', async () => {
    mockFetch([{ match: 'springer', body: `<div id="Abs1-content"><p>${LONG}</p></div>` }]);
    expect((await fetchAbstractFromPage(http, 'https://link.springer.com/x')).length).toBeGreaterThan(80);
    mockFetch([{ match: /.*/, body: '<meta name="description" content="too short">' }]);
    expect(await fetchAbstractFromPage(http, 'https://x')).toBe('');
  });
});

describe('resolveAbstract', () => {
  it('prefers DOI, then Datatracker for drafts, then page', async () => {
    mockFetch([
      { match: 'datatracker.ietf.org/doc/draft-foo/doc.json', body: { title: 'T', abstract: LONG } },
    ]);
    const r = await resolveAbstract(http, { url: 'https://datatracker.ietf.org/doc/draft-foo/02/' });
    expect(r.source).toBe('IETF Datatracker');
    mockFetch([{ match: /.*/, status: 404, body: '' }]);
    expect(await resolveAbstract(http, { url: 'https://nothing' })).toEqual({ text: '', source: '' });
  });
});
