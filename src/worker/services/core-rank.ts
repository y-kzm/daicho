import type { CoreCandidate, CoreResult } from '../../shared/types';
import { CORE_URL } from '../../shared/types';
import { AppError } from '../errors';
import type { Http } from './http';

export function coreSearchUrl(q: string): string {
  return CORE_URL + '?search=' + encodeURIComponent(q) + '&by=all&sort=atitle&page=1';
}

/** 検索クエリの候補をヒットしやすい順に生成する (最大 5 件) */
export function buildCoreQueries(raw: string): string[] {
  const out: string[] = [];
  const shortAcronyms: string[] = [];
  const push = (q: string, arr?: string[]) => {
    const v = String(q || '').replace(/\s+/g, ' ').trim();
    if (v && !out.includes(v) && !shortAcronyms.includes(v)) (arr || out).push(v);
  };
  const parenRe = /\(([^()]{2,30})\)/g;
  let m: RegExpExecArray | null;
  while ((m = parenRe.exec(raw))) {
    const inner = m[1]!.replace(/['’]?\s*\d{2,4}\s*$/, '').trim();
    if (/^[A-Za-z][A-Za-z0-9 .\/-]{1,24}$/.test(inner)) push(inner, inner.length <= 3 ? shortAcronyms : undefined);
  }
  const ORG = ['IEEE', 'ACM', 'IFIP', 'AAAI', 'EDP', 'USENIX'];
  for (const t of raw.match(/\b[A-Z][A-Z0-9-]{2,11}\b/g) || []) {
    if (!ORG.includes(t)) push(t, t.length <= 3 ? shortAcronyms : undefined);
  }
  const cleaned = raw
    .replace(/\([^()]*\)/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b\d+(st|nd|rd|th)\b/gi, ' ')
    .replace(/^[\s\-–—:,]+|[\s\-–—:,]+$/g, '')
    .replace(/\s*[-–—]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  push(cleaned);
  push(raw);
  for (const a of shortAcronyms) if (!out.includes(a)) out.push(a);
  return out.slice(0, 5);
}

/** 3 以上 = 確信度の高い一致 */
export function scoreCoreCandidate(cand: CoreCandidate, rawInput: string): number {
  const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const input = norm(rawInput);
  const title = norm(cand.title);
  const acr = String(cand.acronym || '').trim();
  let score = 0;
  if (acr && acr.length >= 2 && new RegExp('\\b' + acr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(rawInput)) score += 3;
  if (title && input && (input.includes(title) || title.includes(input))) {
    score += 3;
  } else if (title) {
    const words = title.split(' ').filter((w) => w.length > 3);
    if (words.length) {
      const hit = words.filter((w) => input.includes(w)).length / words.length;
      if (hit >= 0.8) score += 2;
      else if (hit >= 0.5) score += 1;
    }
  }
  return score;
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i);
    if (inQ) {
      if (c === '"') {
        if (line.charAt(i + 1) === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** CSV 形式: id,"正式名",略称,ソース,ランク,... */
export function parseCoreCsv(body: string): CoreCandidate[] {
  const candidates: CoreCandidate[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim() || candidates.length >= 8) continue;
    const cells = parseCsvLine(line);
    if (cells.length >= 5 && cells[1] && cells[4]) {
      candidates.push({ title: cells[1], acronym: cells[2] || '', source: cells[3] || '', rank: cells[4] });
    }
  }
  return candidates;
}

export function parseCoreHtml(html: string): CoreCandidate[] {
  const candidates: CoreCandidate[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(html)) && candidates.length < 8) {
    const cells: string[] = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(row[1]!))) {
      cells.push(cell[1]!.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim());
    }
    if (cells.length >= 4 && cells[0] && cells[3]) {
      candidates.push({ title: cells[0], acronym: cells[1] || '', source: cells[2] || '', rank: cells[3] });
    }
  }
  return candidates;
}

async function fetchCoreCandidates(http: Http, query: string): Promise<CoreCandidate[]> {
  const res = await http.get(CORE_URL + '?search=' + encodeURIComponent(query) + '&by=all&do=Export');
  if (res.status === 200 && res.text && res.text.charAt(0) !== '<') return parseCoreCsv(res.text);
  const page = await http.get(coreSearchUrl(query));
  return page.status === 200 ? parseCoreHtml(page.text) : [];
}

export async function fetchCoreRank(http: Http, query: string): Promise<CoreResult> {
  const raw = String(query || '').trim();
  if (!raw) throw new AppError('カンファレンス名または略称を入力してください。');
  const variants = buildCoreQueries(raw);
  let lastUrl = coreSearchUrl(variants[0]!);
  let fallback: CoreResult | null = null;
  for (const v of variants) {
    const url = coreSearchUrl(v);
    lastUrl = url;
    const candidates = await fetchCoreCandidates(http, v);
    if (!candidates.length) continue;
    for (const c of candidates) c.score = scoreCoreCandidate(c, raw);
    candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    if (!fallback) fallback = { candidates, searchUrl: url, query: v };
    if ((candidates[0]!.score ?? 0) >= 3) return { candidates, searchUrl: url, query: v };
  }
  return fallback || { candidates: [], searchUrl: lastUrl, query: variants[0]! };
}
