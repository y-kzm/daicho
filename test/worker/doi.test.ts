import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttp } from '../../src/worker/services/http';
import { extractDoi, fetchDoiMetadata, normalizeKeyPart } from '../../src/worker/services/doi';
import { detectHybridConference } from '../../src/worker/services/crossref';
import { detectCountry } from '../../src/worker/services/country';
import { mockFetch } from './fetch-mock';

const http = createHttp({ mailto: 'me@example.com' });
afterEach(() => vi.unstubAllGlobals());

describe('extractDoi / normalizeKeyPart', () => {
  it('extracts DOI from URLs and strips trailing punctuation', () => {
    expect(extractDoi('https://doi.org/10.1145/3517745.3563019.')).toBe('10.1145/3517745.3563019');
    expect(extractDoi('doi:10.1109/ACCESS.2022.3196028')).toBe('10.1109/ACCESS.2022.3196028');
    expect(extractDoi('10.5555/12345')).toBeNull();
    expect(extractDoi('hello')).toBeNull();
  });
  it('normalizes accents', () => {
    expect(normalizeKeyPart('Lencsés')).toBe('lencses');
    expect(normalizeKeyPart("O'Brien-Smith")).toBe('obriensmith');
  });
});

describe('detectHybridConference', () => {
  it('maps hybrid venues and Proceedings-prefixed journals', () => {
    expect(detectHybridConference('Proceedings on Privacy Enhancing Technologies')).toContain('PETS');
    expect(detectHybridConference('Proceedings of the VLDB Endowment')).toContain('VLDB');
    expect(detectHybridConference('Proceedings of Something')).toBe('Proceedings of Something');
    expect(detectHybridConference('IEEE Access')).toBe('');
  });
});

describe('detectCountry', () => {
  it('uses overrides, then IEICE rule, then OpenAlex ISSN, then publisher name, then members API', async () => {
    mockFetch([
      { match: 'api.openalex.org/sources/issn:1111-1111', body: { country_code: 'IN' } },
      { match: 'api.openalex.org/sources/issn:2222-2222', status: 404, body: '' },
      { match: 'api.crossref.org/members/78', body: { message: { location: 'Basel, Switzerland' } } },
    ]);
    expect(await detectCountry(http, 'Elsevier', null, [], 'Computer Communications')).toBe('オランダ');
    expect(await detectCountry(http, 'IEICE', null, ['1111-1111'], 'IEICE Trans')).toBe('日本');
    expect(await detectCountry(http, 'Taylor & Francis', null, ['1111-1111'], 'IETE Journal of Research')).toBe('インド');
    expect(await detectCountry(http, 'Springer Nature Switzerland', null, ['2222-2222'], 'X')).toBe('スイス');
    expect(await detectCountry(http, 'Springer Berlin Heidelberg', null, [], 'X')).toBe('ドイツ');
    expect(await detectCountry(http, 'MDPI AG', 78, [], 'X')).toBe('スイス');
    expect(await detectCountry(http, 'Unknown Press', null, [], 'X')).toBe('');
  });
});

describe('fetchDoiMetadata', () => {
  it('Crossref proceedings-article: event acronym → conference, OpenAlex country', async () => {
    mockFetch([
      {
        match: 'api.crossref.org/works/10.1145%2F3517745.3563019',
        body: {
          message: {
            type: 'proceedings-article',
            title: ['Great Paper'],
            'container-title': ['Proceedings of the 22nd ACM Internet Measurement Conference'],
            event: { name: 'IMC 22', acronym: 'IMC' },
            author: [{ given: 'Wei', family: 'Zhang' }, { given: 'A', family: 'B' }],
            publisher: 'ACM',
            member: '320',
            ISSN: [],
            URL: 'https://doi.org/10.1145/3517745.3563019',
            'published-print': { 'date-parts': [[2022, 10]] },
          },
        },
      },
      { match: 'api.crossref.org/members/320', body: { message: { location: 'New York, NY, United States' } } },
    ]);
    const m = await fetchDoiMetadata(http, 'https://doi.org/10.1145/3517745.3563019');
    expect(m).toMatchObject({
      doi: '10.1145/3517745.3563019', title: 'Great Paper', year: '2022', publisher: 'ACM',
      journal: '', conference: 'IMC', authors: 'Wei Zhang; A B', bibkeySuggestion: 'zhang2022',
      country: 'アメリカ', url: 'https://doi.org/10.1145/3517745.3563019',
    });
  });

  it('Crossref book-chapter with LNCS: series → journal, volume title → conference', async () => {
    mockFetch([
      {
        match: 'api.crossref.org/works/10.1007',
        body: {
          message: {
            type: 'book-chapter', title: ['Chap'],
            'container-title': ['Lecture Notes in Computer Science', 'Computer Security – ESORICS 2023'],
            author: [{ family: 'Müller' }], publisher: 'Springer Nature Switzerland',
            issued: { 'date-parts': [[2023]] },
          },
        },
      },
    ]);
    const m = await fetchDoiMetadata(http, '10.1007/978-3-031-1');
    expect(m).toMatchObject({ journal: 'Lecture Notes in Computer Science', conference: 'Computer Security – ESORICS 2023', country: 'スイス', bibkeySuggestion: 'muller2023' });
  });

  it('Crossref journal-article with hybrid venue fills conference', async () => {
    mockFetch([
      { match: 'api.crossref.org/works/10.56553', body: { message: { type: 'journal-article', title: ['P'], 'container-title': ['Proceedings on Privacy Enhancing Technologies'], author: [], issued: { 'date-parts': [[2024]] } } } },
    ]);
    const m = await fetchDoiMetadata(http, '10.56553/popets-2024-0001');
    expect(m.journal).toBe('Proceedings on Privacy Enhancing Technologies');
    expect(m.conference).toContain('PETS');
    expect(m.bibkeySuggestion).toBe('');
  });

  it('RFC number → 10.17487 DOI, RFC rules applied, Japanese translation URL preferred', async () => {
    mockFetch([
      { match: 'api.crossref.org/works/10.17487%2Frfc7946', body: { message: { type: 'report', title: ['The GeoJSON Format'], author: [{ family: 'Butler' }], publisher: 'RFC Editor', issued: { 'date-parts': [[2016]] } } } },
      { match: 'tex2e.github.io/rfc-translater/html/rfc7946.html', body: '<html>' },
    ]);
    const m = await fetchDoiMetadata(http, 'RFC 7946');
    expect(m).toMatchObject({
      doi: '10.17487/rfc7946', title: 'RFC 7946: The GeoJSON Format',
      url: 'https://tex2e.github.io/rfc-translater/html/rfc7946.html',
      publisher: 'RFC Editor (IETF)', country: 'アメリカ', bibkeySuggestion: 'rfc7946',
    });
  });

  it('falls back to rfc-editor.org when translation is missing', async () => {
    mockFetch([
      { match: 'api.crossref.org/works/10.17487%2Frfc1', body: { message: { title: ['Host Software'], author: [], issued: { 'date-parts': [[1969]] } } } },
      { match: 'tex2e.github.io', status: 404, body: '' },
    ]);
    expect((await fetchDoiMetadata(http, 'rfc1')).url).toBe('https://www.rfc-editor.org/rfc/rfc1');
  });

  it('Crossref 404 → DataCite (arXiv)', async () => {
    mockFetch([
      { match: 'api.crossref.org/works/', status: 404, body: '' },
      { match: 'api.datacite.org/dois/10.48550', body: { data: { attributes: { titles: [{ title: 'Pre' }], publicationYear: 2025, creators: [{ givenName: 'A', familyName: 'Lee' }], publisher: 'arXiv', url: 'https://arxiv.org/abs/2501.00001' } } } },
    ]);
    const m = await fetchDoiMetadata(http, '10.48550/arXiv.2501.00001');
    expect(m).toMatchObject({ title: 'Pre', year: '2025', publisher: 'arXiv (プレプリント)', authors: 'A Lee', bibkeySuggestion: 'lee2025', url: 'https://arxiv.org/abs/2501.00001' });
  });

  it('Crossref 404 + DataCite 404 → JaLC (Japanese title preferred)', async () => {
    mockFetch([
      { match: 'api.crossref.org/works/', status: 404, body: '' },
      { match: 'api.datacite.org', status: 404, body: '' },
      {
        match: 'api.japanlinkcenter.org/dois/10.14923/x',
        body: {
          data: {
            title_list: [{ lang: 'en', title: 'EN' }, { lang: 'ja', title: '和文' }],
            journal_title_name_list: [{ lang: 'ja', journal_title_name: '電子情報通信学会論文誌B' }],
            publisher_list: [{ lang: 'ja', publisher_name: '電子情報通信学会' }],
            publication_date: { publication_year: 2023 },
            creator_list: [{ names: [{ lang: 'ja', first_name: '太郎', last_name: '山田' }, { lang: 'en', first_name: 'Taro', last_name: 'Yamada' }] }],
            journal_id_list: [],
          },
        },
      },
    ]);
    const m = await fetchDoiMetadata(http, '10.14923/x');
    expect(m).toMatchObject({ title: '和文', journal: '電子情報通信学会論文誌B', country: '日本', authors: 'Taro Yamada', bibkeySuggestion: 'yamada2023' });
  });

  it('all registries 404 → error', async () => {
    mockFetch([{ match: /.*/, status: 404, body: '' }]);
    await expect(fetchDoiMetadata(http, '10.9999/none')).rejects.toThrow('Crossref / DataCite / JaLC のいずれにも登録されていない DOI です: 10.9999/none');
  });

  it('Internet-Draft name → Datatracker', async () => {
    mockFetch([
      { match: 'datatracker.ietf.org/doc/draft-ietf-6man-foo/doc.json', body: { title: 'Foo Draft', rev: '03', time: '2025-05-01', rev_history: [{ rev: '02', published: '2024-11-01' }], authors: [{ name: 'A Author' }] } },
      { match: 'tex2e.github.io', status: 404, body: '' },
    ]);
    const m = await fetchDoiMetadata(http, 'draft-ietf-6man-foo-02');
    expect(m).toMatchObject({ doi: '', title: 'draft-ietf-6man-foo-02: Foo Draft', year: '2024', publisher: 'IETF (Internet-Draft)', url: 'https://datatracker.ietf.org/doc/draft-ietf-6man-foo/02/', bibkeySuggestion: 'draft-ietf-6man-foo', authors: 'A Author' });
  });

  it('non-DOI URL with citation meta tags (USENIX)', async () => {
    mockFetch([
      {
        match: 'usenix.org/conference/x',
        body: `<html><head>
          <meta name="citation_title" content="Fast {IPv6} Lookup">
          <meta content="Jane Doe" name="citation_author">
          <meta name="citation_author" content="John Roe">
          <meta name="citation_publication_date" content="2023/08/09">
          <meta name="citation_conference_title" content="32nd USENIX Security Symposium">
        </head></html>`,
      },
    ]);
    const m = await fetchDoiMetadata(http, 'https://www.usenix.org/conference/x');
    expect(m).toMatchObject({ doi: '', title: 'Fast IPv6 Lookup', year: '2023', conference: '32nd USENIX Security Symposium', publisher: 'USENIX Association', country: 'アメリカ', authors: 'Jane Doe; John Roe', bibkeySuggestion: 'doe2023' });
  });

  it('errors for ACM internal ids, unusable URLs and garbage', async () => {
    mockFetch([{ match: /.*/, body: '<html><head></head></html>' }]);
    await expect(fetchDoiMetadata(http, '10.5555/123')).rejects.toThrow('10.5555/… は ACM Digital Library の内部 ID');
    await expect(fetchDoiMetadata(http, 'https://example.com/no-meta')).rejects.toThrow('この URL から論文メタデータを取得できませんでした。');
    await expect(fetchDoiMetadata(http, 'hello')).rejects.toThrow('DOI を認識できませんでした。例: 10.1145/3517745.3563019');
  });
});
