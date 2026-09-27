import type {
  BackfillCountryResult, BackfillVenueResult, CiteInfo, DuplicateGroup, Entry, Project,
} from '../../shared/types';
import { detectCountry } from '../services/country';
import { fetchCrossrefWork } from '../services/crossref';
import { extractDoi } from '../services/doi';
import type { Http } from '../services/http';
import { loadEntries } from './app-data';
import { updateEntryFields } from './entries';

export const CSV_HEADER = [
  '追加日', 'タグ', 'タイトル', '概要', 'URL', 'DOI', '年', '出版国', '出版社', 'ジャーナル',
  'Impact Factor', 'カンファレンス', 'CORE Ranking', 'BibTeXキー', '読了状態', 'メモ', '引用状態',
];

function csvCell(v: string): string {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s; // 表計算ソフトでの数式展開を防ぐ
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** 「プロジェクト名: 状態」をプロジェクトの並び順でカンマ区切りにする (GAS 版と同じ形式) */
export function serializeCites(cites: Record<string, CiteInfo>, projects: Project[]): string {
  return projects
    .filter((p) => cites[String(p.id)])
    .map((p) => p.name + ': ' + cites[String(p.id)]!.state)
    .join(', ');
}

/** GAS 版スプレッドシートと同じ 17 列の CSV (CRLF) */
export function entriesToCsv(entries: Entry[], projects: Project[]): string {
  const rows = entries.map((e) =>
    [
      e.added, e.tags.join(', '), e.title, e.summary, e.url, e.doi, e.year, e.country, e.publisher, e.journal,
      e.impactFactor, e.conference, e.core, e.bibkey, e.read, e.note, serializeCites(e.cites, projects),
    ].map(csvCell).join(','),
  );
  return [CSV_HEADER.join(','), ...rows].join('\r\n') + '\r\n';
}

export function listDuplicates(entries: Entry[]): DuplicateGroup[] {
  const group = (kind: DuplicateGroup['kind'], pick: (e: Entry) => string): DuplicateGroup[] => {
    const map = new Map<string, number[]>();
    for (const e of entries) {
      const k = pick(e).trim();
      if (!k) continue;
      map.set(k, [...(map.get(k) ?? []), e.id]);
    }
    return [...map.entries()].filter(([, ids]) => ids.length > 1).map(([key, ids]) => ({ kind, key, ids }));
  };
  return [...group('title', (e) => e.title), ...group('doi', (e) => e.doi), ...group('bibkey', (e) => e.bibkey)];
}

const norm = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** 同じ会場名を持つ他エントリの IF / CORE で空欄を補完する (id が大きい方の値を採用) */
export async function backfillVenueRatings(db: D1Database, dryRun: boolean): Promise<BackfillVenueResult> {
  const entries = await loadEntries(db);
  const log: string[] = [];
  const journalIf: Record<string, string> = {};
  const confCore: Record<string, string> = {};
  for (const e of entries) {
    const j = norm(e.journal); const ifv = e.impactFactor.trim();
    if (j && ifv) {
      if (journalIf[j] && journalIf[j] !== ifv) log.push(`[注意/値の不一致] ジャーナル "${e.journal}" に複数の値: ${journalIf[j]} / ${ifv} (後の行の値を採用)`);
      journalIf[j] = ifv;
    }
    const c = norm(e.conference); const cv = e.core.trim();
    if (c && cv) {
      if (confCore[c] && confCore[c] !== cv) log.push(`[注意/値の不一致] カンファレンス "${e.conference}" に複数の値: ${confCore[c]} / ${cv} (後の行の値を採用)`);
      confCore[c] = cv;
    }
  }
  let filledIf = 0; let filledCore = 0;
  const tag = dryRun ? '[補完予定] ' : '[補完] ';
  for (const e of entries) {
    const fields: { impact_factor?: string; core?: string } = {};
    const j = norm(e.journal);
    if (j && !e.impactFactor.trim() && journalIf[j]) { filledIf++; fields.impact_factor = journalIf[j]; log.push(`${tag}${e.title} : IF ← "${journalIf[j]}" (${e.journal})`); }
    const c = norm(e.conference);
    if (c && !e.core.trim() && confCore[c]) { filledCore++; fields.core = confCore[c]; log.push(`${tag}${e.title} : CORE ← "${confCore[c]}" (${e.conference})`); }
    if (!dryRun && Object.keys(fields).length) await updateEntryFields(db, e.id, fields);
  }
  log.push(`---- 完了: IF 補完${dryRun ? '予定' : ''} ${filledIf} 件 / CORE 補完${dryRun ? '予定' : ''} ${filledCore} 件 ----`);
  return { dryRun, log, filledIf, filledCore };
}

/** 既存エントリの出版国を最新ロジックで一括更新する (DOI のないものはスキップ)。
 * 無料プランの外部 subrequest 上限を避けるため、offset/limit でページ処理する。 */
export async function backfillCountries(
  db: D1Database, http: Http, dryRun: boolean, offset = 0, limit = 15,
): Promise<BackfillCountryResult> {
  const all = await loadEntries(db);
  const entries = all.slice(offset, offset + limit);
  const nextOffset = offset + limit < all.length ? offset + limit : null;
  const log: string[] = [];
  let checked = 0; let changed = 0; let skipped = 0; let failed = 0;
  for (const e of entries) {
    const doi = extractDoi(e.doi || e.url);
    if (!doi) { skipped++; log.push('[スキップ/DOIなし] ' + e.title); continue; }
    checked++;
    const { status, work } = await fetchCrossrefWork(http, doi);
    if (!work) { failed++; log.push(`[失敗/Crossref HTTP ${status}] ${e.title}`); continue; }
    const newCountry = await detectCountry(http, work.publisher || '', work.member ?? null, work.ISSN || [], work['container-title']?.[0] || '');
    if (!newCountry) { log.push(`[判定不能] ${e.title} (現状維持: "${e.country}")`); continue; }
    if (newCountry === e.country.trim()) continue;
    changed++;
    log.push(`${dryRun ? '[変更予定] ' : '[変更] '}${e.title} : "${e.country}" → "${newCountry}"`);
    if (!dryRun) await updateEntryFields(db, e.id, { country: newCountry });
    await http.sleep(200);
  }
  log.push(`---- 完了: 対象 ${checked} 件 / 変更${dryRun ? '予定' : ''} ${changed} 件 / DOI なしスキップ ${skipped} 件 / 失敗 ${failed} 件 ----`);
  return { dryRun, log, checked, changed, skipped, failed, offset, limit, nextOffset };
}
