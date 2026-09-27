import { useRef, useState, type DragEvent } from 'react';
import type { Entry } from '../../../shared/types';
import { venueOf } from '../../lib/table';

interface Props {
  entry: Entry;
  projectId: number;
  selected: boolean;
  dragging: boolean;
  canDrop: boolean;
  busy: boolean;
  onSelect: (id: number) => void;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  onDropSide: (after: boolean) => void;
}

/** カンバンの 1 枚。ドロップ位置はカードの上半分 = 前、下半分 = 後 (旧 EntryCard の左右判定を縦にしたもの)。 */
export function KanbanCard({ entry, projectId, selected, dragging, canDrop, busy, onSelect, onDragStart, onDragEnd, onDropSide }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<'before' | 'after' | null>(null);
  const memo = (entry.cites[String(projectId)]?.memo ?? '').split('\n')[0]?.trim() ?? '';
  const meta = [entry.year, venueOf(entry)].filter(Boolean).join(' · ');

  const isAfter = (ev: DragEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return ev.clientY - r.top > r.height / 2;
  };

  return (
    <div ref={ref} role="button" tabIndex={0} draggable={!busy}
      className={'kb-card' + (selected ? ' on' : '') + (dragging ? ' dragging' : '') + (side ? ' drop-' + side : '')}
      onClick={() => onSelect(entry.id)}
      onKeyDown={(ev) => {
        if (ev.nativeEvent.isComposing || (ev.key !== 'Enter' && ev.key !== ' ')) return;
        ev.preventDefault(); // Space でページがスクロールしないように
        onSelect(entry.id);
      }}
      onDragStart={(ev) => {
        ev.dataTransfer.effectAllowed = 'move';
        try { ev.dataTransfer.setData('text/plain', String(entry.id)); } catch { /* Safari などで失敗しても続行 */ }
        onDragStart(entry.id);
      }}
      onDragEnd={() => { setSide(null); onDragEnd(); }}
      onDragOver={(ev) => {
        if (!canDrop) return;
        ev.preventDefault();
        ev.stopPropagation();
        setSide(isAfter(ev) ? 'after' : 'before');
      }}
      onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setSide(null); }}
      onDrop={(ev) => {
        if (!canDrop) return;
        ev.preventDefault();
        ev.stopPropagation();
        setSide(null);
        onDropSide(isAfter(ev));
      }}>
      <div className="kb-title">
        {entry.starred && <span className="kb-star" aria-label="スター">★</span>}
        {entry.title}
      </div>
      {meta && <div className="kb-meta">{meta}</div>}
      {memo && <div className="kb-memo" title={memo}>{memo}</div>}
    </div>
  );
}
