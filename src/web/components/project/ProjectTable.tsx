import { useMemo } from 'react';
import { CITE_STATES, PRIORITY_LABELS, type CiteState, type Entry } from '../../../shared/types';
import { api } from '../../api';
import { columnEntries } from '../../lib/kanban';
import { venueOf } from '../../lib/table';
import { useAppData } from '../../state/AppDataContext';
import { useToast } from '../../state/useToast';

interface Props { projectId: number; entries: Entry[]; selectedId: number | null; onSelect: (id: number) => void }

function rating(e: Entry): string {
  return [e.core && 'CORE ' + e.core.trim(), e.impactFactor && 'IF ' + e.impactFactor.trim()].filter(Boolean).join(' / ');
}

export function ProjectTable({ projectId, entries, selectedId, onSelect }: Props) {
  const { patchEntry, reload } = useAppData();
  const toast = useToast();
  const key = String(projectId);
  const rows = useMemo(() => CITE_STATES.flatMap((s) => columnEntries(entries, projectId, s)), [entries, projectId]);

  const changeState = async (e: Entry, state: CiteState) => {
    const c = e.cites[key];
    if (!c || c.state === state) return;
    patchEntry(e.id, { cites: { ...e.cites, [key]: { ...c, state } } });
    try {
      await api.updateProjectEntry(projectId, e.id, { state });
      await reload(); // サーバが付けた移動先列末尾の position を取り込む
    } catch (err) {
      toast((err as Error).message, true);
      void reload();
    }
  };

  if (!rows.length) return <div className="pv-empty">まだ論文がありません。「論文を追加」から追加してください。</div>;

  return (
    <div className="ptab-wrap">
      <table className="ptab">
        <thead>
          <tr>
            <th aria-label="スター">★</th><th>タイトル</th><th>年</th><th>会議・誌名</th><th>CORE・IF</th>
            <th>読了</th><th>優先度</th><th>タグ</th><th>追加日</th><th>引用状態</th><th>メモ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const c = e.cites[key]!;
            return (
              <tr key={e.id} className={e.id === selectedId ? 'on' : ''} tabIndex={0} onClick={() => onSelect(e.id)}
                onKeyDown={(ev) => {
                  if (ev.target !== ev.currentTarget || ev.nativeEvent.isComposing) return; // 行内の <select> の操作は除く
                  if (ev.key !== 'Enter' && ev.key !== ' ') return;
                  ev.preventDefault();
                  onSelect(e.id);
                }}>
                <td className="ptab-star">{e.starred ? '★' : ''}</td>
                <td className="ptab-title">{e.title}</td>
                <td className="ptab-mono">{e.year}</td>
                <td>{venueOf(e)}</td>
                <td className="ptab-mono">{rating(e)}</td>
                <td>{e.read || '未読'}</td>
                <td>{PRIORITY_LABELS[e.priority]}</td>
                <td className="ptab-tags">{e.tags.join(', ')}</td>
                <td className="ptab-mono">{e.added}</td>
                <td onClick={(ev) => ev.stopPropagation()}>
                  <select className={'ptab-cite c' + c.state} value={c.state} aria-label="引用状態"
                    onChange={(ev) => void changeState(e, ev.target.value as CiteState)}>
                    {CITE_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="ptab-memo" title={c.memo}>{c.memo.split('\n')[0]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
