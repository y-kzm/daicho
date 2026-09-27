import type { CiteState, Entry, EntryInput } from '../../src/shared/types';
import { insertEntry } from '../../src/worker/db/entries';

export function emptyInput(over: Partial<EntryInput> = {}): EntryInput {
  return {
    tags: [], title: '', summary: '', url: '', doi: '', year: '', country: '', publisher: '',
    journal: '', impactFactor: '', conference: '', core: '', bibkey: '', read: '未読', note: '',
    ...over,
  };
}

export async function seedEntry(
  db: D1Database,
  over: Partial<EntryInput> & { title: string },
  added = '2026-01-01',
): Promise<number> {
  return insertEntry(db, emptyInput(over), added);
}

export async function seedProject(db: D1Database, name: string): Promise<number> {
  const r = await db
    .prepare('INSERT INTO projects (name, sort_order) VALUES (?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM projects)) RETURNING id')
    .bind(name)
    .first<{ id: number }>();
  if (!r) throw new Error('seedProject failed: ' + name);
  return r.id;
}

export async function seedCite(
  db: D1Database, entryId: number, projectId: number, state: CiteState, position = 0, memo = '',
): Promise<void> {
  await db
    .prepare('INSERT INTO cites (entry_id, project_id, state, position, memo) VALUES (?, ?, ?, ?, ?)')
    .bind(entryId, projectId, state, position, memo)
    .run();
}

/** 純粋関数テスト用の Entry */
export function makeEntry(over: Partial<Entry> = {}): Entry {
  return {
    id: 1, added: '2026-01-01', tags: [], title: 'T', summary: '', url: '', doi: '', year: '', country: '',
    publisher: '', journal: '', impactFactor: '', conference: '', core: '', bibkey: '', read: '未読', note: '',
    starred: false, priority: 0, lastOpenedAt: '', cites: {}, attachments: [], ...over,
  };
}
