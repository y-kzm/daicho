import { isGrouped, visibleIds, type Group } from '../lib/table';
import { useSelection } from '../state/SelectionContext';
import { EntryCard } from './EntryCard';
import { GroupHeader } from './GroupHeader';
import { useRowClick } from './library/useRowClick';

interface Props {
  groups: Group[];
  collapsed: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
  onOpen: (id: number) => void;
  onTagClick: (t: string) => void;
}

/** カード表示 (既存 EntryCard、ドラッグなし) */
export function CardGrid({ groups, collapsed, onToggleGroup, onOpen, onTagClick }: Props) {
  const sel = useSelection();
  const grouped = isGrouped(groups);
  const onClick = useRowClick(visibleIds(groups, collapsed), onOpen);
  return (
    <div className="card-groups">
      {groups.map((g) => {
        const closed = collapsed.has(g.key);
        return (
          <section key={g.key}>
            {grouped && (
              <GroupHeader as="div" label={g.label} count={g.entries.length} collapsed={closed} onToggle={() => onToggleGroup(g.key)} />
            )}
            {!closed && (
              <div className="card-grid">
                {g.entries.map((e) => (
                  <EntryCard key={e.id} e={e} selected={sel.selected.has(e.id)} focused={sel.focusId === e.id} selectable={sel.mode}
                    onClick={(ev) => onClick(ev, e.id)} onTagClick={onTagClick} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
