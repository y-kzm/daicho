import { useState } from 'react';
import { CITE_STATES, type CiteState, type Entry } from '../../../shared/types';
import { api } from '../../api';
import { columnEntries, moveCard } from '../../lib/kanban';
import { useAppData } from '../../state/AppDataContext';
import { useToast } from '../../state/useToast';
import { KanbanColumn } from './KanbanColumn';

interface Props { projectId: number; entries: Entry[]; selectedId: number | null; onSelect: (id: number) => void }

export function Kanban({ projectId, entries, selectedId, onSelect }: Props) {
  const { patchEntry, reload } = useAppData();
  const toast = useToast();
  const [dragId, setDragId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const drop = async (toState: CiteState, toIndex: number) => {
    if (busy) return;
    const id = dragId;
    setDragId(null);
    if (id === null) return;
    const key = String(projectId);
    const moving = entries.find((e) => e.id === id);
    const fromState = moving?.cites[key]?.state;
    const cols = moveCard(entries, projectId, id, toState, toIndex);
    if (!cols.length || !fromState) return;

    // 楽観更新: 変わった列の全カードに新しい state / position を入れる
    const byId = new Map(entries.map((e) => [e.id, e]));
    for (const col of cols) {
      col.entryIds.forEach((eid, position) => {
        const e = byId.get(eid);
        const c = e?.cites[key];
        if (!e || !c) return;
        patchEntry(eid, { cites: { ...e.cites, [key]: { ...c, state: col.state, position } } });
      });
    }
    setBusy(true);
    try {
      // state 変更を先に送る (サーバは移動先列の末尾に置く)。その後に列順を確定させる
      if (fromState !== toState) await api.updateProjectEntry(projectId, id, { state: toState });
      for (const col of cols) {
        if (col.entryIds.length) await api.reorderColumn(projectId, col.state, col.entryIds);
      }
      // busy のうちに確定値を読み直す (移動前に始まった reload でカードが戻るのを防ぐ)
      await reload();
    } catch (err) {
      toast((err as Error).message, true);
      void reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={'kb' + (busy ? ' kb-busy' : '')}>
      {CITE_STATES.map((s) => (
        <KanbanColumn key={s} state={s} cards={columnEntries(entries, projectId, s)} projectId={projectId}
          selectedId={selectedId} dragId={dragId} busy={busy} onSelect={onSelect}
          onDragStart={(eid) => setDragId(eid)} onDragEnd={() => setDragId(null)}
          onDropAt={(st, index) => void drop(st, index)} />
      ))}
    </div>
  );
}
