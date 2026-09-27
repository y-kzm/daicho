import type { GroupKey, SortKey } from '../../../shared/types';
import { ALL_COLUMNS, DEFAULT_COLUMNS, defaultDir, GROUP_LABELS, SORT_LABELS, type ColumnKey } from '../../lib/table';
import type { TableSort } from '../EntryTable';
import { Popover } from '../Popover';

export type ViewMode = 'table' | 'cards';

interface Props {
  view: ViewMode;
  onView: (v: ViewMode) => void;
  groupBy: GroupKey;
  /** 選べるグループ化 (引用状態はプロジェクトを開いているときだけ) */
  groupKeys: GroupKey[];
  onGroupBy: (g: GroupKey) => void;
  sort: TableSort;
  onSort: (s: TableSort) => void;
  columns: ColumnKey[];
  /** 列の選択肢に出さない列 */
  hiddenColumns?: ColumnKey[];
  onColumns: (c: ColumnKey[]) => void;
}

const SORT_KEYS = Object.keys(SORT_LABELS) as SortKey[];

/** ツールバーの右側: 「表示」(並び順・グループ・列) と、テーブル / カードの切り替え */
export function ViewControls({
  view, onView, groupBy, groupKeys, onGroupBy, sort, onSort, columns, hiddenColumns = [], onColumns,
}: Props) {
  const toggleColumn = (k: ColumnKey) => onColumns(columns.includes(k) ? columns.filter((x) => x !== k) : [...columns, k]);
  const choices = ALL_COLUMNS.filter((c) => c.key !== 'title' && !hiddenColumns.includes(c.key));
  return (
    <div className="view-controls">
      <Popover label="表示" className="hbtn" align="right" title="並び順・グループ・列">
        {() => (
          <div className="fp">
            <div className="fp-row">
              <div className="fp-label">並び順</div>
              <div className="fp-body fp-inline">
                <select aria-label="並び順" value={sort.key}
                  onChange={(ev) => { const k = ev.target.value as SortKey; onSort({ key: k, dir: defaultDir(k) }); }}>
                  {SORT_KEYS.map((k) => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
                </select>
                <div className="seg" role="group" aria-label="並びの向き">
                  <button type="button" className={sort.dir === 'asc' ? 'on' : ''} aria-pressed={sort.dir === 'asc'} onClick={() => onSort({ ...sort, dir: 'asc' })}>昇順</button>
                  <button type="button" className={sort.dir === 'desc' ? 'on' : ''} aria-pressed={sort.dir === 'desc'} onClick={() => onSort({ ...sort, dir: 'desc' })}>降順</button>
                </div>
              </div>
            </div>
            <div className="fp-row">
              <div className="fp-label">グループ</div>
              <div className="fp-body">
                <select aria-label="グループ" value={groupBy} onChange={(ev) => onGroupBy(ev.target.value as GroupKey)}>
                  {groupKeys.map((k) => <option key={k} value={k}>{GROUP_LABELS[k]}</option>)}
                </select>
              </div>
            </div>
            {view === 'table' && (
              <div className="fp-row">
                <div className="fp-label">列</div>
                <div className="fp-body">
                  <div className="fp-chips">
                    {choices.map((c) => (
                      <button key={c.key} type="button" className={'chip' + (columns.includes(c.key) ? ' on' : '')}
                        aria-pressed={columns.includes(c.key)} onClick={() => toggleColumn(c.key)}>{c.label}</button>
                    ))}
                  </div>
                  <button type="button" className="linkbtn fp-reset" onClick={() => onColumns(DEFAULT_COLUMNS)}>列を既定に戻す</button>
                </div>
              </div>
            )}
          </div>
        )}
      </Popover>
      <div className="seg" role="group" aria-label="表示切替">
        <button type="button" className={view === 'table' ? 'on' : ''} aria-pressed={view === 'table'} onClick={() => onView('table')}>テーブル</button>
        <button type="button" className={view === 'cards' ? 'on' : ''} aria-pressed={view === 'cards'} onClick={() => onView('cards')}>カード</button>
      </div>
    </div>
  );
}
