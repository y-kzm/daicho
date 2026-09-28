import type { Entry, EntryInput } from '../../../shared/types';

/** 詳細パネルからの部分更新用: PUT /entries/:id に送る全項目 */
export function toEntryInput(e: Entry): EntryInput {
  return {
    tags: [...e.tags], title: e.title, summary: e.summary, url: e.url, doi: e.doi, year: e.year, country: e.country,
    publisher: e.publisher, journal: e.journal, impactFactor: e.impactFactor, conference: e.conference, core: e.core,
    bibkey: e.bibkey, read: e.read, note: e.note, kind: e.kind, docStatus: e.docStatus,
  };
}
