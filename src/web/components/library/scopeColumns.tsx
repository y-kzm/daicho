import { CITE_STATES, type CiteState, type Entry } from '../../../shared/types';
import { api } from '../../api';
import { useAppData } from '../../state/AppDataContext';
import { useToast } from '../../state/useToast';
import type { ExtraColumn } from '../EntryTable';

function CiteSelect({ e, projectId }: { e: Entry; projectId: number }) {
  const { patchEntry, reload } = useAppData();
  const toast = useToast();
  const key = String(projectId);
  const c = e.cites[key];
  if (!c) return null;
  const change = async (state: CiteState) => {
    if (c.state === state) return;
    patchEntry(e.id, { cites: { ...e.cites, [key]: { ...c, state } } });
    try {
      await api.updateProjectEntry(projectId, e.id, { state });
      await reload(); // サーバが付けた移動先列末尾の position を取り込む
    } catch (err) {
      toast((err as Error).message, true);
      void reload();
    }
  };
  return (
    // 行のクリック (詳細を開く・選択) に流さない
    <span onClick={(ev) => ev.stopPropagation()}>
      <select className={'cite c' + c.state} value={c.state} aria-label="引用状態"
        onChange={(ev) => void change(ev.target.value as CiteState)}>
        {CITE_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </span>
  );
}

/** プロジェクトを開いているときに一覧へ足す列 (引用状態と、このプロジェクトでのメモ) */
export function scopeColumns(projectId: number): ExtraColumn[] {
  return [
    { key: 'cite', label: '引用状態', render: (e) => <CiteSelect e={e} projectId={projectId} /> },
    {
      key: 'memo', label: 'プロジェクトでのメモ',
      render: (e) => {
        const memo = e.cites[String(projectId)]?.memo ?? '';
        return <span className="t-memo" title={memo}>{memo.split('\n')[0]}</span>;
      },
    },
  ];
}
