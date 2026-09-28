import { useState } from 'react';
import { KIND_LABELS, type Entry, type IetfStatus } from '../../../shared/types';
import { api } from '../../api';
import { findRfc, isIetf } from '../../lib/kinds';
import { useAppData } from '../../state/AppDataContext';
import { useDialogs } from '../../state/DialogContext';
import { useToast } from '../../state/useToast';
import { toEntryInput } from './entryInput';

/** 詳細パネルの種類と状態。RFC・I-D は、IETF に今の状態を問い合わせられる */
export function DetailStatus({ e }: { e: Entry }) {
  const { data, reload } = useAppData();
  const { open } = useDialogs();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IetfStatus | null>(null);
  if (e.kind === 'paper') return null;

  const check = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.ietfStatus(e.id);
      setResult(r);
      await reload();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  /** I-D のエントリを、発行された RFC の内容に更新する。メモ・タグ・プロジェクト・PDF は残る */
  const toRfc = (n: number) => {
    // 同じ RFC が登録済みなら、2 件目を作らない (BibTeX キーに a が付いた重複になる)
    const existing = findRfc(data.entries, n, e.id);
    if (existing) {
      toast(`RFC ${n} は「${existing.title}」として登録済みです。重複チェック (⌘K) からマージできます。`, true);
      return;
    }
    confirmToRfc(n);
  };
  const confirmToRfc = (n: number) => open({
    kind: 'confirm', title: `RFC ${n} に更新`,
    body: `このエントリを RFC ${n} の内容に更新します。\n\nタイトル、年、URL、DOI、BibTeX キー、発行元を RFC のものに置き換えます。メモ、タグ、読了状態、プロジェクト、PDF はそのまま残ります。`,
    confirmLabel: '更新する',
    onConfirm: async () => {
      const m = await api.doi(`rfc${n}`);
      await api.updateEntry(e.id, {
        ...toEntryInput(e),
        kind: 'rfc', title: m.title, year: m.year || e.year, url: m.url || e.url, doi: m.doi,
        bibkey: m.bibkeySuggestion, publisher: m.publisher || e.publisher, country: m.country || e.country,
        docStatus: m.docStatus ?? '',
      });
      setResult(null);
      await reload();
      toast(`RFC ${n} に更新しました`);
    },
  });

  return (
    <div className="dp-status">
      <div className="dp-status-line">
        <span className={'kind-badge k-' + e.kind}>{KIND_LABELS[e.kind]}</span>
        {e.docStatus && <span className="t-status">{e.docStatus}</span>}
        {isIetf(e.kind) && (
          <button type="button" className="linkbtn" disabled={busy} onClick={() => void check()}>
            {busy ? '確認中…' : '状態を確認'}
          </button>
        )}
      </div>
      {result && (
        <div className="dp-status-note" role="status">
          {result.message}
          {result.rfcNumber !== undefined && e.kind === 'draft' && (
            <button type="button" className="sbtn" onClick={() => toRfc(result.rfcNumber!)}>RFC {result.rfcNumber} に更新</button>
          )}
        </div>
      )}
    </div>
  );
}
