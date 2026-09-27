import type { ReactNode } from 'react';
import type { Entry } from '../../../shared/types';
import { PRIORITY_LABELS } from '../../../shared/types';
import { venueOf, type ColumnKey } from '../../lib/table';
import { VenuePills } from '../EntryCard';

export function renderCell(col: ColumnKey, e: Entry, projectId?: number): ReactNode {
  switch (col) {
    case 'star':
      return <span className={'star' + (e.starred ? ' on' : '')} title="クリックで ★ を切り替え (s)">{e.starred ? '★' : '☆'}</span>;
    case 'title':
      return <span className="t-title" title={e.title}>{e.title}</span>;
    case 'year':
      return <span className="mono">{e.year}</span>;
    case 'venue':
      return <span className="t-venue" title={venueOf(e)}>{venueOf(e)}</span>;
    case 'core':
      return <VenuePills e={e} />;
    case 'read': {
      const r = e.read || '未読';
      return <span className={'read-label r' + r}>{r}</span>;
    }
    case 'priority':
      return e.priority > 0 ? <span className={'prio p' + e.priority}>{PRIORITY_LABELS[e.priority]}</span> : null;
    case 'tags':
      return <span className="t-tags">{e.tags.map((t) => <span key={t} className="tagchip small">{t}</span>)}</span>;
    case 'pdf': {
      const first = e.attachments[0];
      if (!first) return null;
      // 行のクリック (詳細を開く) に流さず、1 件目を Drive で開く
      return (
        <a className="t-pdf" href={first.url} target="_blank" rel="noopener" onClick={(ev) => ev.stopPropagation()}
          title={e.attachments.map((a) => a.name).join('\n')}>
          PDF{e.attachments.length > 1 ? ` ${e.attachments.length}` : ''}
        </a>
      );
    }
    case 'projects': {
      if (projectId !== undefined) {
        const c = e.cites[String(projectId)];
        return c ? <span className={'cite-label c' + c.state}>{c.state}</span> : null;
      }
      const n = Object.keys(e.cites || {}).length;
      return n ? <span className="mono">{n}</span> : null;
    }
    case 'added':
      return <span className="mono">{e.added}</span>;
    case 'lastOpened':
      return <span className="mono">{e.lastOpenedAt ? e.lastOpenedAt.slice(0, 10) : ''}</span>;
    default:
      return null;
  }
}
