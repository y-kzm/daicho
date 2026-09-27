import type { MouseEvent } from 'react';
import type { Entry } from '../../shared/types';
import { PRIORITY_LABELS } from '../../shared/types';

export function corePillClass(r: string): string {
  if (r.toLowerCase() === 'n/a') return 'na';
  if (r === 'A*' || r === 'A＊' || r === 'A') return 'rank-a';
  return r === 'B' ? 'rank-b' : 'rank-c';
}

/** IF / CORE のピル (カード・テーブル・詳細パネルで共用) */
export function VenuePills({ e }: { e: Entry }) {
  const impact = e.impactFactor.trim();
  const core = e.core.trim();
  return (
    <>
      {impact && (
        <span className={'pill mono ' + (impact.toLowerCase() === 'n/a' ? 'na' : 'if')}
          title={impact.toLowerCase() === 'n/a' ? 'JCR 未収録 (調査済み)' : 'Impact Factor'}>
          IF {impact}
        </span>
      )}
      {core && (
        <span className={'pill ' + corePillClass(core) + ' mono'}
          title={core.toLowerCase() === 'n/a' ? 'CORE 未収録 (調査済み)' : 'CORE Ranking'}>
          CORE {core}
        </span>
      )}
    </>
  );
}

interface Props {
  e: Entry;
  selected: boolean;
  focused: boolean;
  onClick: (ev: MouseEvent<HTMLDivElement>) => void;
  onTagClick: (t: string) => void;
}

/** カード表示の 1 件。編集・削除は詳細パネルから行う (ドラッグ配置は廃止) */
export function EntryCard({ e, selected, focused, onClick, onTagClick }: Props) {
  const read = e.read || '未読';
  const venue = [e.journal, e.conference].filter(Boolean);
  if (!venue.length && e.publisher) venue.push(e.publisher);
  return (
    <div className={'entry r' + read + (selected ? ' selected' : '') + (focused ? ' focused' : '')}
      data-entry-id={e.id} onClick={onClick}>
      <div className="e-top">
        <span className={'star' + (e.starred ? ' on' : '')} aria-label={e.starred ? 'スター付き' : 'スターなし'}>
          {e.starred ? '★' : '☆'}
        </span>
        <div className="e-title">
          {e.title}
          {e.year && <span className="yr mono">{e.year}</span>}
        </div>
        {e.priority > 0 && <span className={'prio p' + e.priority}>{PRIORITY_LABELS[e.priority]}</span>}
        <span className={'read-label r' + read}>{read}</span>
      </div>
      {(venue.length > 0 || e.impactFactor || e.core) && (
        <div className="e-venue">
          {venue.length > 0 && <span>{venue.join(' / ')}</span>}
          <VenuePills e={e} />
        </div>
      )}
      {e.tags.length > 0 && (
        <div className="e-tags">
          {e.tags.map((t) => (
            <button key={t} type="button" className="tagchip" title="クリックで絞り込み"
              onClick={(ev) => { ev.stopPropagation(); onTagClick(t); }}>{t}</button>
          ))}
        </div>
      )}
    </div>
  );
}
