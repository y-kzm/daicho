import type { MouseEvent } from 'react';
import type { Entry } from '../../shared/types';
import { KIND_BADGES, KIND_LABELS, PRIORITY_LABELS } from '../../shared/types';

export function corePillClass(r: string): string {
  if (r.toLowerCase() === 'n/a') return 'na';
  if (r === 'A*' || r === 'A＊' || r === 'A') return 'rank-a';
  return r === 'B' ? 'rank-b' : 'rank-c';
}

/** IF / CORE のピル (カード・テーブル・詳細パネルで共用) */
export function VenuePills({ e }: { e: Entry }) {
  // IF と CORE は論文の評価。ほかの種類では、値が残っていても出さない
  if (e.kind !== 'paper') return null;
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
  /** 選択モード。チェックボックスを出す */
  selectable?: boolean;
  onClick: (ev: MouseEvent<HTMLDivElement>) => void;
  onTagClick: (t: string) => void;
}

/** カード表示の 1 件。編集・削除は詳細パネルから行う (ドラッグ配置は廃止) */
export function EntryCard({ e, selected, focused, selectable = false, onClick, onTagClick }: Props) {
  const read = e.read || '未読';
  const venue = e.kind === 'paper' ? [e.journal, e.conference].filter(Boolean) : [];
  if (!venue.length && e.publisher) venue.push(e.publisher);
  return (
    <div className={'entry r' + read + (selected ? ' selected' : '') + (focused ? ' focused' : '')}
      data-entry-id={e.id} onClick={onClick}>
      <div className="e-top">
        {/* クリックはカード全体で受けるので、チェックボックスは表示だけ */}
        {selectable && <input type="checkbox" className="e-check" readOnly tabIndex={-1} checked={selected} aria-label={`${e.title} を選択`} />}
        <span className={'star' + (e.starred ? ' on' : '')} aria-label={e.starred ? 'スター付き' : 'スターなし'}>
          {e.starred ? '★' : '☆'}
        </span>
        <div className="e-title">
          {e.kind !== 'paper' && <span className={'kind-badge k-' + e.kind} title={KIND_LABELS[e.kind]}>{KIND_BADGES[e.kind]}</span>}
          {e.title}
          {e.year && <span className="yr mono">{e.year}</span>}
        </div>
        {e.priority > 0 && <span className={'prio p' + e.priority}>{PRIORITY_LABELS[e.priority]}</span>}
        <span className={'read-label r' + read}>{read}</span>
      </div>
      {(venue.length > 0 || e.impactFactor || e.core || e.docStatus) && (
        <div className="e-venue">
          {venue.length > 0 && <span>{venue.join(' / ')}</span>}
          {e.docStatus && <span className="t-status">{e.docStatus}</span>}
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
