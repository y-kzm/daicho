import type { Entry } from '../../shared/types';
import type { Venue } from '../../shared/venues';

export type Named = Pick<Venue, 'acronym' | 'name'>;

/** 短い略称は、英単語と区別するために大文字と小文字まで一致したものだけを数える (DATE と date など) */
const STRICT_MAX = 4;
/** 長い略称を大文字と小文字の区別なしで数えるのは、会議名がこの語数以下のときだけ (Sigcomm 2021 は数え、Transactions on Networking は数えない) */
const LOOSE_WORDS_MAX = 3;
/** 会議や論文誌ではないもの */
const NOT_VENUE = /\barxiv\b|\bcorr\b|preprint|\bssrn\b|\bbiorxiv\b|technical report|\bthesis\b/i;

export const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s: string): string => ` ${s.replace(/[^A-Za-z0-9]+/g, ' ').trim()} `;

/** 年や回数を除いた名前 (IMC '23 と IMC 2024 を同じものとして数える) */
export const stem = (s: string): string => s
  .replace(/\b(19|20)\d{2}\b|'\d{2}\b|\b\d+(st|nd|rd|th)\b/gi, ' ')
  .replace(/\(\s*\)/g, ' ')
  .replace(/^\s*(in:?\s+)?((proceedings|proc\.?) of\s+)?(the\s+)?/i, '')
  .replace(/\s+/g, ' ').replace(/^[\s,.:;-]+|[\s,.:;(-]+$/g, '');

/** 論文に書かれた会議名・誌名を、照合しやすい形にしたもの */
export interface VenueText { raw: string; low: string; short: boolean }

export function textOf(s: string): VenueText {
  return { raw: words(s), low: ` ${norm(s)} `, short: norm(stem(s)).split(' ').length <= LOOSE_WORDS_MAX };
}

/** 会議・論文誌として数える論文か (RFC などの文書と、プレプリントは数えない) */
export function venueTextOf(e: Pick<Entry, 'conference' | 'journal' | 'kind'>): VenueText | null {
  if ((e.kind ?? 'paper') !== 'paper') return null;
  const s = `${e.conference} ${e.journal}`.trim();
  return s && !NOT_VENUE.test(s) ? textOf(s) : null;
}

export const isVenueName = (s: string): boolean => !NOT_VENUE.test(s);

/**
 * 会議・論文誌と、論文に書かれた名前を照合する関数を作る。
 * 正式名は語の並びとして含むもの、略称は語として含むものを一致とする (SP が ASPLOS に一致しないように)。
 */
export function matcher(v: Named): (t: VenueText) => boolean {
  const acr = v.acronym.trim();
  const acrLow = norm(acr);
  const name = norm(v.name);
  const byName = name.length >= 2 && name !== acrLow ? ` ${name} ` : '';
  const exact = acr.length >= 2 ? words(acr) : '';
  // 大文字が 2 つ以上ある略称 (SIGCOMM、NeurIPS) は、表記が一致すれば数える。Networking のような語は、短い会議名のときだけ数える
  const proper = (acr.match(/[A-Z]/g) ?? []).length >= 2;
  return (t) => {
    if (byName && t.low.includes(byName)) return true;
    if (!exact) return false;
    if (t.raw.includes(exact) && (proper || t.short)) return true;
    return acr.length > STRICT_MAX && t.short && t.low.includes(` ${acrLow} `);
  };
}
