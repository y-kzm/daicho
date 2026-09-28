import type { EntryKind, IetfStatus } from '../../shared/types';
import { fetchIetfDraftDoc, type IetfDoc } from './ietf';
import type { Http } from './http';

/** 登録してある文書が、IETF のどの文書を指すか */
export type IetfRef =
  | { kind: 'rfc'; number: number }
  | { kind: 'draft'; name: string; rev: string };

const DRAFT = /(draft-[a-z0-9]+(?:-[a-z0-9]+)*)/i;

function splitRev(full: string): { name: string; rev: string } {
  const m = full.match(/^(.*)-(\d{2})$/);
  return m ? { name: m[1]!, rev: m[2]! } : { name: full, rev: '' };
}

/**
 * エントリの項目から IETF の文書を特定する。種類 (kind) を優先し、DOI・BibTeX キー・タイトルの順に探す。
 * 版 (-05 など) は、タイトルか URL に書かれていれば使う。BibTeX キーには版を付けない運用のため。
 */
export function ietfRefOf(e: { kind: EntryKind; doi: string; bibkey: string; title: string; url: string }): IetfRef | null {
  // BibTeX キーは、重複を避けるために末尾へ 1 文字 (a, b, c…) が付くことがある
  const rfc = e.doi.match(/^10\.17487\/rfc(\d{1,5})$/i) ?? e.bibkey.match(/^rfc(\d{1,5})[a-z]?$/i) ?? e.title.match(/^\s*rfc\s*(\d{1,5})\b/i);
  const rfcRef: IetfRef | null = rfc ? { kind: 'rfc', number: Number(rfc[1]) } : null;
  const draftIn = (s: string) => s.match(DRAFT)?.[1]?.toLowerCase();
  // 版 (-05) が書いてあるのはタイトルか URL。名前もそこから採り、無い場合だけ BibTeX キーを使う
  const written = draftIn(e.title) ?? draftIn(e.url);
  const keyed = draftIn(e.bibkey);
  const draftRef: IetfRef | null = written
    ? { kind: 'draft', ...splitRev(written) }
    : keyed ? { kind: 'draft', ...splitRev(keyed) } : null;
  // 種類が決まっていれば、その種類の文書だけを探す (RFC のエントリに I-D の状態を書かない)
  if (e.kind === 'rfc') return rfcRef;
  if (e.kind === 'draft') return draftRef;
  return rfcRef ?? draftRef;
}

/** I-D が RFC になっていれば、その番号 (履歴の最後に rfcNNNN として載る) */
export function rfcNumberOf(d: IetfDoc): number | undefined {
  for (const h of [...(d.rev_history ?? [])].reverse()) {
    const m = String(h.name ?? '').match(/^rfc(\d{1,5})$/i);
    if (m) return Number(m[1]);
  }
  return undefined;
}

const date = (s: string | null | undefined): string => String(s ?? '').slice(0, 10);

/** RFC の状態は標準化の段階 (Internet Standard など)。分からなければ「発行済み」 */
export function rfcStatus(d: IetfDoc): string {
  return String(d.std_level ?? '').trim() || '発行済み';
}

export function draftStatus(d: IetfDoc, rev: string): IetfStatus {
  const latest = String(d.rev ?? '');
  const state = String(d.state ?? '').trim();
  const rfcNumber = rfcNumberOf(d);
  const name = String(d.name ?? '');
  if (state === 'RFC' || rfcNumber !== undefined) {
    const label = rfcNumber === undefined ? 'RFC' : `RFC ${rfcNumber}`;
    return { docStatus: `${label} として発行済み`, rfcNumber, message: `この Internet-Draft は ${label} として発行されています。` };
  }
  const newer = rev && latest && latest > rev ? `${name}-${latest}` : undefined;
  const tail = newer ? ` 新しい版 -${latest} があります (登録は -${rev})。` : '';
  if (state === 'Active') {
    const until = date(d.expires);
    return { docStatus: '有効', newerDraft: newer, message: `有効な Internet-Draft です${until ? ` (${until} に失効)` : ''}。${tail}`.trim() };
  }
  if (state === 'Replaced') return { docStatus: '置き換え済み', newerDraft: newer, message: `別の文書に置き換えられています。${tail}`.trim() };
  if (state === 'Expired') {
    const at = date(d.expires);
    return { docStatus: '失効', newerDraft: newer, message: `失効しています${at ? ` (${at})` : ''}。${tail}`.trim() };
  }
  return { docStatus: state || '不明', newerDraft: newer, message: `状態: ${state || '不明'}。${tail}`.trim() };
}

/** Datatracker に問い合わせて、今の状態を返す。見つからなければ null */
export async function fetchIetfStatus(http: Http, ref: IetfRef): Promise<IetfStatus | null> {
  const d = await fetchIetfDraftDoc(http, ref.kind === 'rfc' ? `rfc${ref.number}` : ref.name);
  if (!d) return null;
  if (ref.kind === 'rfc') {
    const s = rfcStatus(d);
    return { docStatus: s, message: `RFC ${ref.number}: ${s}` };
  }
  return draftStatus(d, ref.rev);
}
