import type { Entry } from '../../shared/types';
import type { VenueKind } from '../../shared/venues';
import type { CatalogItem } from './ccfddl';
import { isVenueName, matcher, norm, stem, textOf, venueTextOf, type Named, type VenueText } from './match';

/** 公開データの会議ごとに、台帳にある論文の数を数える (0 件のものは含めない) */
export function libraryCounts(items: readonly CatalogItem[], entries: readonly Entry[]): Map<string, number> {
  const texts = entries.map(venueTextOf).filter((t): t is VenueText => t !== null);
  const out = new Map<string, number>();
  for (const it of items) {
    const n = texts.filter(matcher(it)).length;
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
    if (!isVenueName(raw)) continue;
    const name = stem(raw);
    const key = norm(name);
    if (key.length < 2) continue;
    const g = groups.get(key);
    if (g) g.papers++;
    else groups.set(key, { name, kind: e.journal ? 'journal' : 'conference', papers: 1 });
  }
  const tests = known.map(matcher);
  return [...groups.values()]
    .filter((g) => {
      const t = textOf(g.name);
      return !tests.some((m) => m(t));
    })
    .sort((a, b) => b.papers - a.papers || a.name.localeCompare(b.name))
    .slice(0, limit);
}
