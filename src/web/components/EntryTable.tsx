import { Fragment, type ReactNode } from 'react';
import type { Entry, SortKey } from '../../shared/types';
import { ALL_COLUMNS, isGrouped, visibleIds, type ColumnKey, type Group } from '../lib/table';
import { useSelection } from '../state/SelectionContext';
import { GroupHeader } from './GroupHeader';
import { renderCell } from './library/cells';
import { useEntryActions } from './library/useEntryActions';
import { useRowClick } from './library/useRowClick';

export interface TableSort { key: SortKey; dir: 'asc' | 'desc' }
export interface ExtraColumn { key: string; label: string; render: (e: Entry) => ReactNode }

interface Props {
  entries: Entry[];
  groups: Group[];
  columns: ColumnKey[];
  sort: TableSort;
  onSort: (key: SortKey) => void;
  projectId?: number;
  collapsed?: ReadonlySet<string>;
  onToggleGroup?: (key: string) => void;
  onOpen?: (id: number) => void;
  extraColumns?: ExtraColumn[];
}

const NO_COLLAPSE: ReadonlySet<string> = new Set();

export function EntryTable({
  entries, groups, columns, sort, onSort, projectId, collapsed = NO_COLLAPSE, onToggleGroup, onOpen, extraColumns = [],
}: Props) {
  const sel = useSelection();
  const actions = useEntryActions();
  const cols = ALL_COLUMNS.filter((c) => c.key === 'title' || columns.includes(c.key));
  const grouped = isGrouped(groups);
  const onRowClick = useRowClick(visibleIds(groups, collapsed), onOpen);
  const allSelected = entries.length > 0 && entries.every((e) => sel.selected.has(e.id));
  const colSpan = cols.length + extraColumns.length + (sel.mode ? 1 : 0);
  const ariaSort = (key?: SortKey): 'ascending' | 'descending' | undefined =>
    key !== undefined && key === sort.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined;

  return (
    <div className="table-wrap">
      <table className={'etable' + (sel.mode ? ' selecting' : '')}>
        <thead>
          <tr>
            {sel.mode && (
              <th className="c-check">
                <input type="checkbox" aria-label="すべて選択" checked={allSelected}
                  onChange={() => (allSelected ? sel.clear() : sel.selectMany(entries.map((e) => e.id)))} />
              </th>
            )}
            {cols.map((c) => {
              const s = c.sort;
              return (
                <th key={c.key} className={'c-' + c.key + (s ? ' sortable' : '')} aria-sort={ariaSort(s)}
                  title={s ? 'クリックで並べ替え' : undefined} onClick={s ? () => onSort(s) : undefined}>
                  {c.label}
                  {s !== undefined && s === sort.key && <span className="sort-ind">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              );
            })}
            {extraColumns.map((x) => <th key={x.key} className={'c-' + x.key}>{x.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const closed = collapsed.has(g.key);
            return (
              <Fragment key={g.key}>
                {grouped && (
                  <GroupHeader as="row" label={g.label} count={g.entries.length} collapsed={closed}
                    onToggle={() => onToggleGroup?.(g.key)} colSpan={colSpan} />
                )}
                {!closed && g.entries.map((e) => (
                  <tr key={e.id} data-entry-id={e.id}
                    className={(sel.selected.has(e.id) ? 'selected' : '') + (sel.focusId === e.id ? ' focused' : '')}
                    onMouseDown={(ev) => { if (ev.shiftKey) ev.preventDefault(); }}
                    onClick={(ev) => onRowClick(ev, e.id)}>
                    {sel.mode && (
                      <td className="c-check" onClick={(ev) => ev.stopPropagation()}>
                        <input type="checkbox" aria-label={`${e.title} を選択`} checked={sel.selected.has(e.id)} onChange={() => sel.toggle(e.id)} />
                      </td>
                    )}
                    {cols.map((c) => (
                      <td key={c.key} className={'c-' + c.key}
                        onClick={c.key === 'star' ? (ev) => { ev.stopPropagation(); actions.toggleStar(e); } : undefined}>
                        {renderCell(c.key, e, projectId)}
                      </td>
                    ))}
                    {extraColumns.map((x) => <td key={x.key} className={'c-' + x.key}>{x.render(e)}</td>)}
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
