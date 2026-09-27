import { useEffect, useState } from 'react';
import type { CiteState, Entry } from '../../../shared/types';
import { KanbanCard } from './KanbanCard';

interface Props {
  state: CiteState;
  cards: Entry[];
  projectId: number;
  selectedId: number | null;
  dragId: number | null;
  busy: boolean;
  onSelect: (id: number) => void;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  onDropAt: (state: CiteState, index: number) => void;
}

/** 1 列。カードの上に落とせばその前後、カードの無い余白に落とせば列の末尾。 */
export function KanbanColumn({ state, cards, projectId, selectedId, dragId, busy, onSelect, onDragStart, onDragEnd, onDropAt }: Props) {
  const [endHover, setEndHover] = useState(false);
  const canDrop = dragId !== null && !busy;
  useEffect(() => { if (dragId === null) setEndHover(false); }, [dragId]);

  return (
    <section className={'kb-col c' + state} aria-label={state}>
      <header className="kb-head">
        <span>{state}</span>
        <span className="kb-n">{cards.length}</span>
      </header>
      <div className={'kb-list' + (endHover ? ' drop-end' : '')}
        onDragOver={(ev) => { if (!canDrop) return; ev.preventDefault(); setEndHover(true); }}
        onDragLeave={(ev) => { if (ev.currentTarget === ev.target) setEndHover(false); }}
        onDrop={(ev) => { if (!canDrop) return; ev.preventDefault(); setEndHover(false); onDropAt(state, cards.length); }}>
        {cards.map((e, i) => (
          <KanbanCard key={e.id} entry={e} projectId={projectId} selected={e.id === selectedId}
            dragging={e.id === dragId} canDrop={canDrop} busy={busy} onSelect={onSelect}
            onDragStart={onDragStart} onDragEnd={onDragEnd}
            onDropSide={(after) => onDropAt(state, after ? i + 1 : i)} />
        ))}
        {!cards.length && <div className="kb-empty">ここへドラッグ</div>}
      </div>
    </section>
  );
}
