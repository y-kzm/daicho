import { isIsoDate, type DeadlineInput, type DeadlineKind, type VenueImport, type WikicfpHit } from '../../shared/venues';
import { AppError } from '../errors';
import { htmlToText } from './extract';
import { fetchPage, type Page } from './fetch-page';

/**
 * WikiCFP (http://www.wikicfp.com、CC BY-SA 3.0) から会議を探す。
 * API は無いので、検索結果と会議のページを読む。利用者が検索したときだけ取得し、巡回はしない。
 */
const BASE = 'http://www.wikicfp.com';
export const WIKICFP_HOME = 'http://www.wikicfp.com/';
/** robots.txt の Crawl-delay に合わせた、取得の間隔 */
const GAP_MS = 5000;
const WAIT_MAX_MS = 12000;
const CACHE_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 60;
const HITS_MAX = 20;
const ORGS = ['ACM', 'IEEE', 'USENIX', 'IFIP', 'ISOC', 'IACR', 'AAAI', 'SIAM'];

type Fetcher = (url: string) => Promise<Page>;
interface State {
  last: number;
  /** 読み取った結果 (ページそのものは持たない) */
  cache: Map<string, { at: number; value: unknown }>;
  /** 取得中のもの (同じ検索が同時に来ても、取得は 1 回にする) */
  pending: Map<string, Promise<unknown>>;
  sleep: (ms: number) => Promise<void>;
}

const state: State = { last: 0, cache: new Map(), pending: new Map(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** テスト用: 保持している結果と、待ち時間を消す */
export function resetWikicfp(sleep?: State['sleep']): void {
  state.last = 0;
  state.cache.clear();
  state.pending.clear();
  if (sleep) state.sleep = sleep;
}

async function load<T>(url: string, parse: (html: string) => T, fetcher: Fetcher, now: () => number): Promise<T> {
  const wait = state.last + GAP_MS - now();
  // 待ちが重なった場合は、待たせずに断る (要求が長く残らないように)
  if (wait > WAIT_MAX_MS) throw new AppError('WikiCFP への取得が続いています。少し待ってからやり直してください。', 429);
  // 次の取得の時刻を先に確保する (同時に来た要求が、同じ時刻に取得しないように)
  state.last = Math.max(now(), state.last + GAP_MS);
  if (wait > 0) await state.sleep(wait);
  const page = await fetcher(url);
  if (page.status !== 200) throw new AppError('WikiCFP から取得できませんでした。時間をおいてやり直してください。', 502);
  const value = parse(page.text);
  if (state.cache.size >= CACHE_MAX) state.cache.delete(state.cache.keys().next().value as string);
  state.cache.set(url, { at: now(), value });
  return value;
}

async function get<T>(url: string, parse: (html: string) => T, fetcher: Fetcher, now: () => number): Promise<T> {
  const hit = state.cache.get(url);
  if (hit && now() - hit.at < CACHE_MS) return hit.value as T;
  const running = state.pending.get(url);
  if (running) return running as Promise<T>;
  const p = load(url, parse, fetcher, now).finally(() => state.pending.delete(url));
  state.pending.set(url, p);
  return p;
}

const clean = (html: string): string => htmlToText(html).replace(/\s+/g, ' ').trim();
/** 名前の先頭に付く評価の数字 (1 2 3 4) を除く */
const cleanName = (s: string): string => s.replace(/^(\d\s+)+/, '').trim();

/** 検索結果の表を読む。1 件は 2 行で、1 行目に略称と名前、2 行目に開催日・開催地・締切がある */
export function parseSearch(html: string): WikicfpHit[] {
  const out: WikicfpHit[] = [];
  // 繰り返しには上限を付ける (細工されたページで、処理時間が入力の長さの 2 乗にならないように)
  const row = /<td[^>]{0,200}rowspan="2"[^>]{0,200}>\s{0,100}<a href="\/cfp\/servlet\/event\.showcfp\?eventid=(\d{1,12})[^"]{0,200}">([^<]{0,400})<\/a>\s{0,100}<\/td>\s{0,100}<td[^>]{0,200}>([^<]{0,600})<\/td>\s{0,100}<\/tr>\s{0,100}<tr[^>]{0,200}>\s{0,100}<td[^>]{0,200}>([^<]{0,200})<\/td>\s{0,100}<td[^>]{0,200}>([^<]{0,300})<\/td>\s{0,100}<td[^>]{0,200}>([^<]{0,200})<\/td>/g;
  for (const m of html.matchAll(row)) {
    const title = clean(m[2]!);
    if (!title) continue;
    out.push({
      eventId: Number(m[1]), title, name: cleanName(clean(m[3]!)).slice(0, 300),
      when: clean(m[4]!).slice(0, 80), where: clean(m[5]!).slice(0, 120), deadline: clean(m[6]!).slice(0, 80),
    });
    if (out.length >= HITS_MAX) break;
  }
  return out;
}

const KINDS: [RegExp, DeadlineKind][] = [
  [/abstract/i, 'abstract'], [/submission|paper/i, 'paper'], [/notification/i, 'notification'], [/final|camera/i, 'camera'],
];

/** 「IEEE CCNC 2026」を、主催・略称・年に分ける */
export function splitTitle(title: string): { org: string; acronym: string; year: number } {
  const year = Number(title.match(/\b(19|20)\d{2}\b/)?.[0] ?? NaN);
  let rest = title.replace(/\b(19|20)\d{2}\b/g, ' ').replace(/\s+/g, ' ').trim();
  const org = ORGS.find((o) => new RegExp(`^${o}\\b`, 'i').test(rest) && rest.length > o.length) ?? '';
  if (org) rest = rest.slice(org.length).replace(/^[\s/-]+/, '');
  return { org, acronym: rest.slice(0, 60), year };
}

const dateOf = (s: string | undefined): string => {
  const d = (s ?? '').slice(0, 10);
  return isIsoDate(d) ? d : '';
};

/** 会議のページを、取り込みの形にする。読めない場合は null */
export function parseEvent(html: string): VenueImport | null {
  const prop = (name: string, from = html): string | undefined =>
    from.match(new RegExp(`property="v:${name}"\\s{1,20}content="([^"]{0,400})"`))?.[1];
  const title = clean(prop('summary') ?? '');
  const { org, acronym, year } = splitTitle(title);
  if (!acronym || !Number.isInteger(year)) return null;
  const table = html.indexOf('<th');
  const head = table === -1 ? html : html.slice(0, table);
  const startDate = dateOf(prop('startDate', head));
  const endDate = dateOf(prop('endDate', head));
  const described = clean(html.match(/property="v:description">([^<]{0,600})</)?.[1] ?? '');
  const name = cleanName(described.replace(/^.*?:\s*/, '')).replace(/\s*\b(19|20)\d{2}\b\s*$/, '').trim() || acronym;
  const link = html.match(/Link:\s{0,20}<a href="(https?:\/\/[^"\s]{1,500})"/)?.[1] ?? '';
  const deadlines: DeadlineInput[] = [];
  for (const m of html.matchAll(/<th[^>]{0,200}>([^<]{0,200})<\/th>[\s\S]{0,400}?property="v:startDate"\s{1,20}content="([^"]{0,40})"/g)) {
    const label = clean(m[1]!);
    const kind = KINDS.find(([re]) => re.test(label))?.[1];
    const due = dateOf(m[2]);
    // WikiCFP には時刻とタイムゾーンが無い。日付だけを AoE として入れる
    if (kind && due) deadlines.push({ kind, label: '', dueLocal: due, timezone: 'AoE', estimated: false, source: 'wikicfp' });
  }
  return {
    venue: {
      // 題名に主催が無い場合は、正式名から読む (The IEEE Consumer Communications ...)
      kind: 'conference', acronym, name: name.slice(0, 300), org: org || (ORGS.find((o) => new RegExp(`\\b${o}\\b`).test(name)) ?? ''), field: '', core: '', impactFactor: '', siteUrl: '',
      issn: '', reviewTime: '', submitUrl: '', note: '', source: 'wikicfp', sourceKey: `wikicfp/${acronym.toLowerCase()}`,
    },
    editions: [{
      year, label: '', siteUrl: link.slice(0, 500), place: clean(prop('locality') ?? '').slice(0, 120),
      dateText: '', startDate, endDate: endDate >= startDate ? endDate : startDate, estimated: false, source: 'wikicfp', note: '',
      deadlines: deadlines.slice(0, 20),
    }],
  };
}

export async function searchWikicfp(query: string, fetcher: Fetcher = fetchPage, now: () => number = Date.now): Promise<WikicfpHit[]> {
  const q = query.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (q.length < 2) throw new AppError('検索する語を 2 文字以上で入力してください。');
  // year=a は、過去の開催も含めて探す (次の年がまだ載っていない会議は、前の年から予想で作る)
  const byYear = (html: string): WikicfpHit[] => parseSearch(html).sort((a, b) => splitTitle(b.title).year - splitTitle(a.title).year);
  return get(`${BASE}/cfp/servlet/tool.search?q=${encodeURIComponent(q)}&year=a`, byYear, fetcher, now);
}

export async function loadWikicfpEvent(eventId: number, fetcher: Fetcher = fetchPage, now: () => number = Date.now): Promise<VenueImport> {
  const data = await get(`${BASE}/cfp/servlet/event.showcfp?eventid=${eventId}`, parseEvent, fetcher, now);
  if (!data) throw new AppError('WikiCFP のページを読み取れませんでした。手入力で追加してください。', 502);
  return data;
}
