import type { AppData, Attachment, CiteInfo, CiteState, Entry, EntryKind, FilterQuery, Priority, Project, SavedFilter } from '../../shared/types';
import { CITE_STATES, CORE_URL, ENTRY_KINDS, JCR_URL, PRIORITIES, READ_STATES } from '../../shared/types';
import { ATTACHMENTS_SQL, rowToAttachment, type AttachmentRow } from './attachments';

export interface EntryRow {
  id: number;
  added: string;
  title: string;
  summary: string;
  url: string;
  doi: string;
  year: string;
  country: string;
  publisher: string;
  journal: string;
  impact_factor: string;
  conference: string;
  core: string;
  bibkey: string;
  read: string;
  note: string;
  kind: string;
  doc_status: string;
  starred: number;
  priority: number;
  last_opened_at: string;
}

export interface ProjectRow {
  id: number;
  name: string;
  note: string;
  archived: number;
  sort_order: number;
  count: number;
}

export interface FilterRow {
  id: number;
  name: string;
  sort_order: number;
  query: string;
}

interface TagLink { entry_id: number; name: string }
interface CiteLink { entry_id: number; project_id: number; state: string; position: number; memo: string }

/** プロジェクト一覧 (所属件数つき)。projects.ts の listProjects と共有する */
export const PROJECTS_SQL =
  'SELECT p.id, p.name, p.note, p.archived, p.sort_order, ' +
  '(SELECT COUNT(*) FROM cites c WHERE c.project_id = p.id) AS count ' +
  'FROM projects p ORDER BY p.sort_order, p.id';

/** 保存フィルタ一覧。filters.ts の listFilters と共有する */
export const FILTERS_SQL = 'SELECT id, name, sort_order, query FROM saved_filters ORDER BY sort_order, id';

/** 知らない値は論文として読む */
export function toKind(v: unknown): EntryKind {
  return (ENTRY_KINDS as readonly string[]).includes(String(v)) ? (v as EntryKind) : 'paper';
}

/** 0〜3 以外は 0 (なし) として読む */
export function toPriority(v: unknown): Priority {
  const n = Number(v);
  return (PRIORITIES as readonly number[]).includes(n) ? (n as Priority) : 0;
}

export function rowToEntry(
  r: EntryRow, tags: string[], cites: Record<string, CiteInfo>, attachments: Attachment[] = [],
): Entry {
  return {
    id: r.id,
    added: r.added,
    tags,
    title: r.title,
    summary: r.summary,
    url: r.url,
    doi: r.doi,
    year: r.year,
    country: r.country,
    publisher: r.publisher,
    journal: r.journal,
    impactFactor: r.impact_factor,
    conference: r.conference,
    core: r.core,
    bibkey: r.bibkey,
    read: r.read || '未読',
    note: r.note,
    kind: toKind(r.kind),
    docStatus: r.doc_status ?? '',
    starred: r.starred === 1,
    priority: toPriority(r.priority),
    lastOpenedAt: r.last_opened_at,
    cites,
    attachments,
  };
}

export function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    note: r.note,
    archived: r.archived === 1,
    sortOrder: r.sort_order,
    count: r.count,
  };
}

/** query は書き込み時に parseFilterQuery で検証済み。壊れた JSON だけは空条件として読む。 */
export function rowToFilter(r: FilterRow): SavedFilter {
  let query: FilterQuery = {};
  try {
    const v: unknown = JSON.parse(r.query);
    if (v && typeof v === 'object' && !Array.isArray(v)) query = v as FilterQuery;
  } catch {
    query = {};
  }
  return { id: r.id, name: r.name, sortOrder: r.sort_order, query };
}

export async function loadEntries(db: D1Database): Promise<Entry[]> {
  const [rows, tagLinks, citeLinks, files] = await db.batch([
    db.prepare('SELECT * FROM entries ORDER BY id'),
    db.prepare(
      'SELECT et.entry_id, t.name FROM entry_tags et JOIN tags t ON t.id = et.tag_id ORDER BY et.entry_id, et.position',
    ),
    db.prepare('SELECT entry_id, project_id, state, position, memo FROM cites'),
    db.prepare(ATTACHMENTS_SQL),
  ]);
  const filesByEntry = new Map<number, Attachment[]>();
  for (const f of files!.results as unknown as AttachmentRow[]) {
    const arr = filesByEntry.get(f.entry_id) ?? [];
    arr.push(rowToAttachment(f));
    filesByEntry.set(f.entry_id, arr);
  }
  const tagsByEntry = new Map<number, string[]>();
  for (const l of tagLinks!.results as unknown as TagLink[]) {
    const arr = tagsByEntry.get(l.entry_id) ?? [];
    arr.push(l.name);
    tagsByEntry.set(l.entry_id, arr);
  }
  const citesByEntry = new Map<number, Record<string, CiteInfo>>();
  for (const l of citeLinks!.results as unknown as CiteLink[]) {
    const obj = citesByEntry.get(l.entry_id) ?? {};
    obj[String(l.project_id)] = { state: l.state as CiteState, position: l.position, memo: l.memo };
    citesByEntry.set(l.entry_id, obj);
  }
  return (rows!.results as unknown as EntryRow[]).map((r) =>
    rowToEntry(r, tagsByEntry.get(r.id) ?? [], citesByEntry.get(r.id) ?? {}, filesByEntry.get(r.id) ?? []),
  );
}

export async function getAppData(db: D1Database): Promise<AppData> {
  const [entries, tags, projects, filters] = await Promise.all([
    loadEntries(db),
    db.prepare('SELECT name FROM tags ORDER BY sort_order, id').all<{ name: string }>(),
    db.prepare(PROJECTS_SQL).all<ProjectRow>(),
    db.prepare(FILTERS_SQL).all<FilterRow>(),
  ]);
  return {
    entries,
    tags: tags.results.map((t) => t.name),
    projects: projects.results.map(rowToProject),
    savedFilters: filters.results.map(rowToFilter),
    readStates: READ_STATES,
    citeStates: CITE_STATES,
    links: { jcr: JCR_URL, core: CORE_URL },
  };
}
