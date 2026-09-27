import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Entry } from '../../../shared/types';
import { api } from '../../api';
import { scoreMatch } from '../../lib/palette';
import { venueOf } from '../../lib/table';
import { useAppData } from '../../state/AppDataContext';
import { useToast } from '../../state/useToast';

interface Props { projectId: number; onPicked: (ids: number[]) => void; label?: string }

const LIMIT = 30;
const INITIAL_STATE = '気になる';

/** パレットと同じ採点 (タイトル・BibTeX キー・タグの最高点)。 */
function scoreEntry(q: string, e: Entry): number {
  return Math.max(scoreMatch(q, e.title), scoreMatch(q, e.bibkey), ...e.tags.map((t) => scoreMatch(q, t)));
}

/** まだプロジェクトに入っていない論文。空検索は追加日の新しい順。 */
function candidates(entries: Entry[], projectId: number, query: string): Entry[] {
  const key = String(projectId);
  const pool = entries.filter((e) => !e.cites[key]);
  const byAdded = (a: Entry, b: Entry) => (a.added < b.added ? 1 : a.added > b.added ? -1 : b.id - a.id);
  const q = query.trim();
  if (!q) return [...pool].sort(byAdded).slice(0, LIMIT);
  return pool
    .map((e) => ({ e, s: scoreEntry(q, e) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || byAdded(a.e, b.e))
    .slice(0, LIMIT)
    .map((x) => x.e);
}

export function AddEntryPicker({ projectId, onPicked, label = '論文を追加' }: Props) {
  const { data, reload } = useAppData();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const list = useMemo(() => candidates(data.entries, projectId, q), [data.entries, projectId, q]);

  const close = () => { setOpen(false); setQ(''); setPicked([]); setCursor(0); };
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) close();
    };
    // フォーカスが検索欄になくても Esc で閉じる (Popover.tsx と同じパターン: capture + stopPropagation)
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === 'Escape') { ev.stopPropagation(); close(); }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const submit = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    const done = new Set<number>();
    try {
      // 1 件ずつ送る (サーバが列末尾 position = max+1 を採番するので並列にしない)
      for (const id of picked) {
        await api.setCite(id, projectId, INITIAL_STATE);
        done.add(id);
      }
      await reload();
      toast(`${picked.length} 件を追加しました`);
      onPicked(picked);
      close();
    } catch (err) {
      toast((err as Error).message, true);
      void reload();
    } finally {
      // 途中で失敗しても、追加できた分は選択から外す (再送で重複させない)
      setPicked((p) => p.filter((id) => !done.has(id)));
      setBusy(false);
    }
  };

  const onKeyDown = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.nativeEvent.isComposing) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setCursor((c) => Math.min(c + 1, Math.max(list.length - 1, 0))); }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (ev.metaKey || ev.ctrlKey) { void submit(); return; }
      const e = list[cursor];
      if (e) toggle(e.id);
    }
    // Escape はフォーカス位置によらず window の capture リスナー (下の useEffect) が処理する
  };

  return (
    <div className="aep" ref={rootRef}>
      <button type="button" className="pv-btn primary" aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}>{label}</button>
      {open && (
        <div className="aep-pop" role="dialog" aria-modal="false" aria-label={label}>
          <input className="aep-q" autoFocus value={q} placeholder="タイトル・BibTeX キー・タグで検索"
            onChange={(ev) => { setQ(ev.target.value); setCursor(0); }} onKeyDown={onKeyDown} />
          <ul className="aep-list" role="listbox" aria-multiselectable="true">
            {list.map((e, i) => (
              <li key={e.id} role="option" aria-selected={picked.includes(e.id)}
                className={'aep-item' + (i === cursor ? ' cur' : '')}
                onMouseEnter={() => setCursor(i)} onClick={() => toggle(e.id)}>
                <input type="checkbox" readOnly tabIndex={-1} checked={picked.includes(e.id)} />
                <span className="aep-t">{e.title}</span>
                <span className="aep-sub">{[e.year, venueOf(e)].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
            {!list.length && <li className="aep-none">追加できる論文はありません</li>}
          </ul>
          <div className="aep-foot">
            <span className="aep-hint">↑↓ 移動 / Enter 選択 / ⌘Enter 追加</span>
            <button type="button" className="pv-btn" onClick={close}>キャンセル</button>
            <button type="button" className="pv-btn primary" disabled={!picked.length || busy} onClick={() => void submit()}>
              {busy ? '追加中…' : `${picked.length} 件を追加`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
