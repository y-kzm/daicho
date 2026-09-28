import type { Entry } from '../../shared/types';
import type { Venue, VenueKind } from '../../shared/venues';
import type { CatalogItem } from './ccfddl';

type Named = Pick<Venue, 'acronym' | 'name'>;

/** 短い略称は、英単語と区別するために大文字と小文字まで一致したものだけを数える (DATE と date など) */
const STRICT_MAX = 4;
/** 長い略称を大文字と小文字の区別なしで数えるのは、会議名がこの語数以下のときだけ (Sigcomm 2021 は数え、Transactions on Networking は数えない) */
const LOOSE_WORDS_MAX = 3;
/** 会議や論文誌ではないもの */
const NOT_VENUE = /\barxiv\b|\bcorr\b|preprint|\bssrn\b|\bbiorxiv\b|technical report|\bthesis\b/i;

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s: string): string => ` ${s.replace(/[^A-Za-z0-9]+/g, ' ').trim()} `;
const venueText = (e: Pick<Entry, 'conference' | 'journal'>): string => `${e.conference} ${e.journal}`.trim();

/** 年や回数を除いた名前 (IMC '23 と IMC 2024 を同じものとして数える) */
const stem = (s: string): string => s
  .replace(/\b(19|20)\d{2}\b|'\d{2}\b|\b\d+(st|nd|rd|th)\b/gi, ' ')
  .replace(/\(\s*\)/g, ' ')
  .replace(/^\s*(in:?\s+)?((proceedings|proc\.?) of\s+)?(the\s+)?/i, '')
  .replace(/\s+/g, ' ').replace(/^[\s,.:;-]+|[\s,.:;(-]+$/g, '');

interface Text { raw: string; low: string; short: boolean }

function matches(v: Named, t: Text): boolean {
  const name = norm(v.name);
  if (name.length >= 2 && name !== norm(v.acronym) && t.low.includes(` ${name} `)) return true;
  const acr = v.acronym.trim();
  if (acr.length < 2) return false;
  // 大文字が 2 つ以上ある略称 (SIGCOMM、NeurIPS) は、表記が一致すれば数える。Networking のような語は、短い会議名のときだけ数える
  const exact = t.raw.includes(words(acr));
  if (exact && ((acr.match(/[A-Z]/g) ?? []).length >= 2 || t.short)) return true;
  return acr.length > STRICT_MAX && t.short && t.low.includes(` ${norm(acr)} `);
}

const textOf = (s: string): Text => {
  const low = norm(stem(s));
  return { raw: words(s), low: ` ${norm(s)} `, short: low.split(' ').length <= LOOSE_WORDS_MAX };
};

const textsOf = (entries: readonly Entry[]): Text[] => entries
  .filter((e) => (e.kind ?? 'paper') === 'paper')
  .map(venueText).filter((s) => s && !NOT_VENUE.test(s))
  .map(textOf);

/** 公開データの会議ごとに、台帳にある論文の数を数える (0 件のものは含めない) */
export function libraryCounts(items: readonly CatalogItem[], entries: readonly Entry[]): Map<string, number> {
  const texts = textsOf(entries);
  const out = new Map<string, number>();
  for (const it of items) {
    const n = texts.filter((t) => matches(it, t)).length;
    if (n) out.set(it.key, n);
  }
  return out;
}

export interface Unlisted { name: string; kind: VenueKind; papers: number }

/**
 * 台帳の論文に出てくるが、公開データにも追跡中にも無い会議・論文誌。論文の多い順。
 * 手入力で追加するときの候補にする。
 */
export function unlistedVenues(entries: readonly Entry[], known: readonly Named[], limit = 8): Unlisted[] {
  const groups = new Map<string, Unlisted>();
  for (const e of entries) {
    if ((e.kind ?? 'paper') !== 'paper') continue;
    const raw = (e.journal || e.conference).trim();
    if (NOT_VENUE.test(raw)) continue;
    const name = stem(raw);
    const key = norm(name);
    if (key.length < 2) continue;
    const g = groups.get(key);
    if (g) g.papers++;
    else groups.set(key, { name, kind: e.journal ? 'journal' : 'conference', papers: 1 });
  }
  return [...groups.values()]
    .filter((g) => {
      const t = textOf(g.name);
      return !known.some((k) => matches(k, t));
    })
    .sort((a, b) => b.papers - a.papers || a.name.localeCompare(b.name))
    .slice(0, limit);
}
