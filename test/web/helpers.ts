import type { AppData, Entry, Project } from '../../src/shared/types';
import { CITE_STATES, READ_STATES } from '../../src/shared/types';

export function entry(over: Partial<Entry> & { id: number }): Entry {
  return {
    added: '2026-01-01', tags: [], title: 'T' + over.id, summary: '', url: '', doi: '', year: '', country: '',
    publisher: '', journal: '', impactFactor: '', conference: '', core: '', bibkey: '', read: '未読', note: '',
    starred: false, priority: 0, lastOpenedAt: '', cites: {}, attachments: [], ...over,
  };
}

export function project(over: Partial<Project> & { id: number; name: string }): Project {
  return { note: '', archived: false, sortOrder: over.id, count: 0, ...over };
}

export function appData(entries: Entry[], over: Partial<AppData> = {}): AppData {
  return {
    entries, tags: [], projects: [], savedFilters: [], readStates: READ_STATES, citeStates: CITE_STATES,
    links: { jcr: '', core: '' }, ...over,
  };
}
