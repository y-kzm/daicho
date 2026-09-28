import {
  VENUES_MAX, type DeadlineInput, type DeadlineKind, type EditionInput, type Venue, type VenueDeadline, type VenueEdition,
  type VenueImport, type VenueInput, type VenueKind, type VenueSource,
} from '../../shared/venues';
import { AppError, notFound } from '../errors';

interface VenueRow {
  id: number; kind: string; acronym: string; name: string; org: string; field: string; core: string; impact_factor: string;
  site_url: string; note: string; source: string; source_key: string; archived: number;
}
interface EditionRow {
  id: number; venue_id: number; year: number; label: string; site_url: string; place: string; date_text: string;
  start_date: string; end_date: string; estimated: number; source: string; note: string;
}
interface DeadlineRow {
  id: number; edition_id: number; kind: string; label: string; due_local: string; timezone: string; estimated: number; source: string;
}

const toDeadline = (r: DeadlineRow): VenueDeadline => ({
  id: r.id, kind: r.kind as DeadlineKind, label: r.label, dueLocal: r.due_local, timezone: r.timezone,
  estimated: r.estimated === 1, source: r.source as VenueSource,
});

const toEdition = (r: EditionRow, deadlines: VenueDeadline[]): VenueEdition => ({
  id: r.id, year: r.year, label: r.label, siteUrl: r.site_url, place: r.place, dateText: r.date_text,
  startDate: r.start_date, endDate: r.end_date, estimated: r.estimated === 1, source: r.source as VenueSource, note: r.note, deadlines,
});

const toVenue = (r: VenueRow, editions: VenueEdition[]): Venue => ({
  id: r.id, kind: r.kind as VenueKind, acronym: r.acronym, name: r.name, org: r.org, field: r.field, core: r.core,
  impactFactor: r.impact_factor, siteUrl: r.site_url, note: r.note, source: r.source as VenueSource, sourceKey: r.source_key,
  archived: r.archived === 1, editions,
});

function group<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const list = m.get(key(r));
    if (list) list.push(r);
    else m.set(key(r), [r]);
  }
  return m;
}

/** 会議を略称順、開催を新しい年から、締切を登録順で返す */
export async function loadVenues(db: D1Database): Promise<Venue[]> {
  const [v, e, d] = await db.batch([
    db.prepare('SELECT * FROM venues ORDER BY lower(CASE WHEN acronym != \'\' THEN acronym ELSE name END), id'),
    db.prepare('SELECT * FROM venue_editions ORDER BY venue_id, year DESC, label, id'),
    db.prepare('SELECT * FROM venue_deadlines ORDER BY edition_id, position, id'),
  ]);
  const deadlines = group(d!.results as unknown as DeadlineRow[], (r) => r.edition_id);
  const editions = group(e!.results as unknown as EditionRow[], (r) => r.venue_id);
  return (v!.results as unknown as VenueRow[]).map((row) =>
    toVenue(row, (editions.get(row.id) ?? []).map((er) => toEdition(er, (deadlines.get(er.id) ?? []).map(toDeadline)))));
}

export async function getVenue(db: D1Database, id: number): Promise<Venue> {
  const v = (await loadVenues(db)).find((x) => x.id === id);
  if (!v) throw notFound('会議・論文誌');
  return v;
}

/** 開催と、それを持つ会議を返す */
export async function getEdition(db: D1Database, id: number): Promise<{ venue: Venue; edition: VenueEdition }> {
  for (const venue of await loadVenues(db)) {
    const edition = venue.editions.find((e) => e.id === id);
    if (edition) return { venue, edition };
  }
  throw notFound('開催');
}

const VENUE_COLS = 'kind, acronym, name, org, field, core, impact_factor, site_url, note, source, source_key';
const venueValues = (v: VenueInput): (string | number)[] =>
  [v.kind, v.acronym, v.name, v.org, v.field, v.core, v.impactFactor, v.siteUrl, v.note, v.source, v.sourceKey];

export async function insertVenue(db: D1Database, v: VenueInput, now: string): Promise<number> {
  const n = await db.prepare('SELECT COUNT(*) AS n FROM venues').first<{ n: number }>();
  if ((n?.n ?? 0) >= VENUES_MAX) throw new AppError(`登録できる会議・論文誌は ${VENUES_MAX} 件までです。`);
  const r = await db
    .prepare(`INSERT INTO venues (${VENUE_COLS}, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(...venueValues(v), now)
    .first<{ id: number }>();
  if (!r) throw new AppError('登録できませんでした。', 500);
  return r.id;
}

export async function updateVenue(db: D1Database, id: number, v: VenueInput): Promise<void> {
  const sets = VENUE_COLS.split(', ').map((c) => `${c} = ?`).join(', ');
  const r = await db.prepare(`UPDATE venues SET ${sets} WHERE id = ?`).bind(...venueValues(v), id).run();
  if (r.meta.changes === 0) throw notFound('会議・論文誌');
}

export async function setArchived(db: D1Database, id: number, archived: boolean): Promise<void> {
  const r = await db.prepare('UPDATE venues SET archived = ? WHERE id = ?').bind(archived ? 1 : 0, id).run();
  if (r.meta.changes === 0) throw notFound('会議・論文誌');
}

export async function deleteVenue(db: D1Database, id: number): Promise<void> {
  const r = await db.prepare('DELETE FROM venues WHERE id = ?').bind(id).run();
  if (r.meta.changes === 0) throw notFound('会議・論文誌');
}

const EDITION_COLS = 'year, label, site_url, place, date_text, start_date, end_date, estimated, source, note';
const editionValues = (e: EditionInput): (string | number)[] =>
  [e.year, e.label, e.siteUrl, e.place, e.dateText, e.startDate, e.endDate, e.estimated ? 1 : 0, e.source, e.note];

function deadlineStatements(db: D1Database, editionId: number | { sql: string }, list: DeadlineInput[]): D1PreparedStatement[] {
  const idSql = typeof editionId === 'number' ? '?' : editionId.sql;
  return list.map((d, i) => {
    const stmt = db.prepare(
      `INSERT INTO venue_deadlines (edition_id, kind, label, due_local, timezone, estimated, source, position) VALUES (${idSql}, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const rest = [d.kind, d.label, d.dueLocal, d.timezone, d.estimated ? 1 : 0, d.source, i];
    return typeof editionId === 'number' ? stmt.bind(editionId, ...rest) : stmt.bind(...rest);
  });
}

async function assertNoTwin(db: D1Database, venueId: number, e: EditionInput, exceptId: number | null): Promise<void> {
  const twin = await db
    .prepare('SELECT id FROM venue_editions WHERE venue_id = ? AND year = ? AND label = ? AND id != ?')
    .bind(venueId, e.year, e.label, exceptId ?? -1)
    .first();
  if (twin) throw new AppError(`${e.year} 年の開催は、既に登録されています。`, 409);
}

const NEW_EDITION = { sql: "(SELECT seq FROM sqlite_sequence WHERE name = 'venue_editions')" };

export async function insertEdition(db: D1Database, venueId: number, e: EditionInput): Promise<number> {
  const exists = await db.prepare('SELECT id FROM venues WHERE id = ?').bind(venueId).first();
  if (!exists) throw notFound('会議・論文誌');
  await assertNoTwin(db, venueId, e, null);
  await db.batch([
    db.prepare(`INSERT INTO venue_editions (venue_id, ${EDITION_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(venueId, ...editionValues(e)),
    ...deadlineStatements(db, NEW_EDITION, e.deadlines),
  ]);
  const r = await db
    .prepare('SELECT id FROM venue_editions WHERE venue_id = ? AND year = ? AND label = ?')
    .bind(venueId, e.year, e.label)
    .first<{ id: number }>();
  return r?.id ?? 0;
}

/** 開催を保存する。締切は渡された一覧で置き換える */
export async function updateEdition(db: D1Database, id: number, e: EditionInput): Promise<void> {
  const row = await db.prepare('SELECT venue_id FROM venue_editions WHERE id = ?').bind(id).first<{ venue_id: number }>();
  if (!row) throw notFound('開催');
  await assertNoTwin(db, row.venue_id, e, id);
  const sets = EDITION_COLS.split(', ').map((c) => `${c} = ?`).join(', ');
  await db.batch([
    db.prepare(`UPDATE venue_editions SET ${sets} WHERE id = ?`).bind(...editionValues(e), id),
    db.prepare('DELETE FROM venue_deadlines WHERE edition_id = ?').bind(id),
    ...deadlineStatements(db, id, e.deadlines),
  ]);
}

export async function deleteEdition(db: D1Database, id: number): Promise<void> {
  const r = await db.prepare('DELETE FROM venue_editions WHERE id = ?').bind(id).run();
  if (r.meta.changes === 0) throw notFound('開催');
}

export interface ImportSummary { venueId: number; created: boolean; added: number; updated: number; kept: number }

/**
 * 公開データを取り込む。取得元と識別子が同じ会議があれば、それを更新する。
 * 開催は、取得元が公開データのまま (= 手で直していない) のものだけを置き換える。
 * 手で直した開催 (source = manual) と、AI の候補を反映した開催は、そのまま残す。
 */
export async function importVenue(db: D1Database, data: VenueImport, now: string): Promise<ImportSummary> {
  const found = await db
    .prepare('SELECT id FROM venues WHERE source = ? AND source_key = ?')
    .bind(data.venue.source, data.venue.sourceKey)
    .first<{ id: number }>();
  const venueId = found ? found.id : await insertVenue(db, data.venue, now);
  const summary: ImportSummary = { venueId, created: !found, added: 0, updated: 0, kept: 0 };
  if (found) {
    // 名前・略称・順位などは公開データに合わせる。メモと、利用者が入れた分野・IF は残す
    await db
      .prepare('UPDATE venues SET acronym = ?, name = ?, core = CASE WHEN ? != \'\' THEN ? ELSE core END WHERE id = ?')
      .bind(data.venue.acronym, data.venue.name, data.venue.core, data.venue.core, venueId)
      .run();
  }
  const current = (await db.prepare('SELECT id, year, label, source FROM venue_editions WHERE venue_id = ?').bind(venueId).all<{
    id: number; year: number; label: string; source: string;
  }>()).results;
  const stmts: D1PreparedStatement[] = [];
  for (const e of data.editions) {
    const old = current.find((c) => c.year === e.year && c.label === e.label);
    if (!old) {
      stmts.push(
        db.prepare(`INSERT INTO venue_editions (venue_id, ${EDITION_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(venueId, ...editionValues(e)),
        ...deadlineStatements(db, NEW_EDITION, e.deadlines),
      );
      summary.added++;
    } else if (old.source === data.venue.source) {
      const sets = EDITION_COLS.split(', ').filter((c) => c !== 'note').map((c) => `${c} = ?`).join(', ');
      const values = editionValues(e).slice(0, -1);
      stmts.push(
        db.prepare(`UPDATE venue_editions SET ${sets} WHERE id = ?`).bind(...values, old.id),
        db.prepare('DELETE FROM venue_deadlines WHERE edition_id = ?').bind(old.id),
        ...deadlineStatements(db, old.id, e.deadlines),
      );
      summary.updated++;
    } else {
      summary.kept++;
    }
  }
  if (stmts.length) await db.batch(stmts);
  return summary;
}

/* ---------- カレンダーのトークン ---------- */

const TOKEN_KEY = 'venues.calendarToken';

export async function getCalendarToken(db: D1Database): Promise<string | null> {
  const r = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(TOKEN_KEY).first<{ value: string }>();
  return r?.value || null;
}

export async function setCalendarToken(db: D1Database, token: string | null): Promise<void> {
  if (token === null) {
    await db.prepare('DELETE FROM settings WHERE key = ?').bind(TOKEN_KEY).run();
    return;
  }
  await db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(TOKEN_KEY, token)
    .run();
}
