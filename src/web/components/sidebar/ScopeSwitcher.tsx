import type { Project } from '../../../shared/types';
import { Popover } from '../Popover';

interface Props {
  scope: number | null;
  current: Project | undefined;
  total: number;
  active: Project[];
  archived: Project[];
  onSelect: (scope: number | null) => void;
  onAdd: () => void;
}

/** サイドバー先頭の切り替え。選んだ範囲に、一覧・タグ・検索・統計が絞られる */
export function ScopeSwitcher({ scope, current, total, active, archived, onSelect, onAdd }: Props) {
  const label = (
    <>
      <span className="scope-cap">{scope === null ? '表示中' : 'プロジェクト'}</span>
      <span className="scope-name">{scope === null ? 'すべての文献' : current?.name ?? 'プロジェクト'}</span>
      <span className="scope-caret" aria-hidden="true">▾</span>
    </>
  );
  const item = (id: number | null, name: string, count: number) => (
    <button key={id ?? 'all'} type="button" role="option" aria-selected={scope === id}
      className={'menu-item scope-opt' + (scope === id ? ' on' : '')} onClick={() => onSelect(id)}>
      <span className="scope-opt-name">{name}</span>
      <span className="scope-opt-n">{count}</span>
    </button>
  );
  return (
    <Popover label={label} className="scope-btn" wrapClassName={'scope-switch' + (scope === null ? '' : ' in-project')} title="表示する範囲を切り替える">
      {(close) => (
        <div className="menu scope-menu" role="listbox" aria-label="表示する範囲" onClick={close}>
          {item(null, 'すべての文献', total)}
          {active.length > 0 && <div className="menu-note">プロジェクト</div>}
          {active.map((p) => item(p.id, p.name, p.count))}
          {archived.length > 0 && <div className="menu-note">アーカイブ</div>}
          {archived.map((p) => item(p.id, p.name, p.count))}
          <button type="button" className="menu-item scope-new" onClick={onAdd}>＋ 新しいプロジェクト</button>
        </div>
      )}
    </Popover>
  );
}
