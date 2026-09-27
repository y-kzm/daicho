import type { Entry } from '../../shared/types';

export interface VenueMaps { journalIf: Record<string, string>; confCore: Record<string, string> }

export const normVenue = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** 会場名 → IF / CORE の記憶 (id 順に走査し、後の値で上書き) */
export function buildVenueMaps(entries: Entry[]): VenueMaps {
  const journalIf: Record<string, string> = {};
  const confCore: Record<string, string> = {};
  for (const e of [...entries].sort((a, b) => a.id - b.id)) {
    const j = normVenue(e.journal);
    if (j && e.impactFactor.trim()) journalIf[j] = e.impactFactor.trim();
    const c = normVenue(e.conference);
    if (c && e.core.trim()) confCore[c] = e.core.trim();
  }
  return { journalIf, confCore };
}

/** フォームの IF / CORE が空なら既知の値で補完し、補完した項目名を返す */
export function autofillVenueRatings(
  form: { journal: string; conference: string; impactFactor: string; core: string },
  maps: VenueMaps,
): { impactFactor: string; core: string; filled: string[] } {
  const filled: string[] = [];
  let { impactFactor, core } = form;
  const j = normVenue(form.journal);
  if (j && !impactFactor.trim() && maps.journalIf[j]) { impactFactor = maps.journalIf[j]!; filled.push('IF ' + impactFactor); }
  const c = normVenue(form.conference);
  if (c && !core.trim() && maps.confCore[c]) { core = maps.confCore[c]!; filled.push('CORE ' + core); }
  return { impactFactor, core, filled };
}

/** CORE 検索リンク用のヒント: 括弧内の略称があれば優先、なければ年号・括弧を除去 */
export function coreQueryHint(raw: string): string {
  const m = raw.match(/\(([A-Za-z][A-Za-z0-9 .\/-]{1,24})\)/);
  if (m) return m[1]!.replace(/['']?\s*\d{2,4}\s*$/, '').trim();
  return raw
    .replace(/\([^()]*\)/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\s*[-–—]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
