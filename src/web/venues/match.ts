import type { Entry } from '../../shared/types';
import type { Venue } from '../../shared/venues';

export type Named = Pick<Venue, 'acronym' | 'name'>;

/** 短い略称は、英単語と区別するために大文字と小文字まで一致したものだけを数える (DATE と date など) */
const STRICT_MAX = 4;
/** 名前の先頭に付く主催者。照合のときは無いものとして扱う */
const PUBLISHER = /^((acm|ieee|ifip|usenix|siam|aaai) )+/;
/** 会議や論文誌ではないもの */
const NOT_VENUE = /\barxiv\b|\bcorr\b|preprint|\bssrn\b|\bbiorxiv\b|technical report|\bthesis\b/i;

export const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s: string): string => ` ${s.replace(/[^A-Za-z0-9]+/g, ' ').trim()} `;

/** 「In Proceedings of the」などの前置きを除く。除くと 1 語しか残らない場合は、それが名前なので除かない (Proceedings of the IEEE) */
function dropLead(s: string): string {
  const rest = s.replace(/^\s*(in:?\s+)?(proceedings|proc\.?)\s+of\s+(the\s+)?/i, '').replace(/^\s*in:\s+/i, '');
  return rest.trim().split(/\s+/).length >= 2 || !/^\s*(in:?\s+)?proc/i.test(s) ? rest : s.replace(/^\s*in:?\s+/i, '');
}

/** 年や回数を除いた名前 (IMC '23 と IMC 2024 を同じものとして数える) */
export const stem = (s: string): string => dropLead(s
  .replace(/\b(19|20)\d{2}\b|'\d{2}\b|\b\d+(st|nd|rd|th)\b/gi, ' ')
  .replace(/\(\s*\)/g, ' ')
  .replace(/\s+/g, ' '))
  .replace(/^[\s,.:;-]+|[\s,.:;(-]+$/g, '');

/** 主催者を除いた形 (IFIP Networking と Networking を同じものとして扱う) */
const core = (s: string): string => norm(s).replace(PUBLISHER, '');

/** 論文に書かれた会議名・誌名を、照合しやすい形にしたもの */
export interface VenueText {
  /** 表記のまま、語で区切ったもの */
  raw: string;
  /** 小文字にしたもの */
  low: string;
  /** 年、前置き、主催者を除いた名前 */
  core: string;
}

export function textOf(s: string): VenueText {
  return { raw: words(s), // ACM の電子図書館は「ACM on Internet Measurement Conference」と書く
    low: ` ${norm(s)} `.replace(/ acm on /g, ' acm '), core: core(stem(s)) };
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
 * - 正式名は、語の並びとして含むものを一致とする。1 語だけの名前 (Nature) は、名前全体が一致するものに限る (Nature Communications は別の論文誌)
 * - 略称は、語として含むものを一致とする (SP が ASPLOS に一致しないように)
 * - 略称が普通の語でもある場合 (CLOUD、Networking) は、表記が大文字で一致するか、名前全体が一致するものに限る
 */
export function matcher(v: Named): (t: VenueText) => boolean {
  const acr = v.acronym.trim();
  const acrLow = norm(acr);
  const name = norm(v.name);
  const nameCore = core(v.name);
  const phrases = name.length >= 2 && name !== acrLow
    ? [...new Set([name, nameCore])].filter((n) => n.includes(' ')).map((n) => ` ${n} `)
    : [];
  const oneWord = name.length >= 2 && name !== acrLow && !nameCore.includes(' ') ? nameCore : '';
  const exact = acr.length >= 2 ? words(acr) : '';
  // 略称が正式名の中に語として出てくるなら、頭文字を並べたものではなく普通の語 (Cloud Computing の CLOUD)
  const wordy = ` ${name} `.includes(` ${acrLow} `) && name !== acrLow;
  const capitals = (acr.match(/[A-Z]/g) ?? []).length >= 2;
  return (t) => {
    if (phrases.some((p) => t.low.includes(p))) return true;
    if (oneWord && t.core === oneWord) return true;
    if (!exact) return false;
    if (t.core === acrLow && acr.length > STRICT_MAX) return true;
    if (t.raw.includes(exact)) return capitals || t.core === acrLow;
    return acr.length > STRICT_MAX && !wordy && t.low.includes(` ${acrLow} `);
  };
}
