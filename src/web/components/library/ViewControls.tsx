import type { GroupKey, SortKey } from '../../../shared/types';
import { defaultDir, GROUP_LABELS, SORT_LABELS, type ColumnKey } from '../../lib/table';
import type { TableSort } from '../EntryTable';
import { ColumnMenu } from './ColumnMenu';

export type ViewMode = 'table' | 'cards';

interface Props {
  view: ViewMode;
  onView: (v: ViewMode) => void;
  groupBy: GroupKey;
  onGroupBy: (g: GroupKey) => void;
  sort: TableSort;
  onSort: (s: TableSort) => void;
  columns: ColumnKey[];
  onColumns: (c: ColumnKey[]) => void;
}

const SORT_KEYS = Object.keys(SORT_LABELS) as SortKey[];
const GROUP_KEYS = Object.keys(GROUP_LABELS) as GroupKey[];

export function ViewControls({ view, onView, groupBy, onGroupBy, sort, onSort, columns, onColumns }: Props) {
  return (
    <div className="lib-toolbar">
      <label>
        並び順{' '}
        <select value={sort.key} onChange={(ev) => { const k = ev.target.value as SortKey; onSort({ key: k, dir: defaultDir(k) }); }}>
          {SORT_KEYS.map((k) => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
        </select>
      </label>
      <button type="button" className="hbtn icon" title={sort.dir === 'asc' ? '昇順 (クリックで降順)' : '降順 (クリックで昇順)'}
        onClick={() => onSort({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}>
        {sort.dir === 'asc' ? '↑' : '↓'}
      </button>
      <label>
        グループ{' '}
        <select value={groupBy} onChange={(ev) => onGroupBy(ev.target.value as GroupKey)}>
          {GROUP_KEYS.map((k) => <option key={k} value={k}>{GROUP_LABELS[k]}</option>)}
        </select>
      </label>
      <span className="spacer" />
      <div className="seg" role="group" aria-label="表示切替">
        <button type="button" className={view === 'table' ? 'on' : ''} onClick={() => onView('table')}>テーブル</button>
        <button type="button" className={view === 'cards' ? 'on' : ''} onClick={() => onView('cards')}>カード</button>
      </div>
      {view === 'table' && <ColumnMenu columns={columns} onChange={onColumns} />}
    </div>
  );
}
