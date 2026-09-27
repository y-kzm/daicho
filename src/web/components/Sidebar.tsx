import { useMemo, useState } from 'react';
import type { Project } from '../../shared/types';
import { sortByOrder } from '../lib/order';
import { navigate, type Route } from '../lib/router';
import { BUILTIN_LABELS, BUILTINS, builtinQuery, countFor, sameSource, type LibrarySource } from '../lib/smart';
import { useAppData } from '../state/AppDataContext';
import { useLibrary } from '../state/LibraryContext';
import { InlineName } from './sidebar/InlineName';
import { SideItem, type MenuAction } from './sidebar/SideItem';
import { SidebarFooter } from './sidebar/SidebarFooter';
import { useSidebarActions } from './sidebar/useSidebarActions';

export function Sidebar({ route }: { route: Route }) {
  const { data } = useAppData();
  const { source, selectSource } = useLibrary();
  const a = useSidebarActions();
  const [adding, setAdding] = useState<'project' | 'tag' | null>(null);
  const now = useMemo(() => new Date(), [data]);
  const tagCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data.entries) for (const t of e.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  }, [data.entries]);
  const filters = useMemo(() => sortByOrder(data.savedFilters), [data.savedFilters]);
  const projects = useMemo(() => sortByOrder(data.projects), [data.projects]);
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  const isOn = (src: LibrarySource) => route.name === 'library' && sameSource(source, src);
  const go = (src: LibrarySource) => { selectSource(src); navigate({ name: 'library' }); };
  const upDown = (i: number, n: number, move: (d: -1 | 1) => void): MenuAction[] => [
    { label: '上へ', disabled: i === 0, onSelect: () => move(-1) },
    { label: '下へ', disabled: i === n - 1, onSelect: () => move(1) },
  ];
  /** プロジェクトの `…` メニュー (「名前を変更」は SideItem が先頭に足す)。計画 C はこの関数を変更しない */
  const projectMenu = (p: Project, i: number): MenuAction[] => (p.archived
    ? [
      { label: 'アーカイブ解除', onSelect: () => a.archiveProject(p.id, false) },
      { label: '削除', danger: true, onSelect: () => a.deleteProject(p) },
    ]
    : [
      ...upDown(i, active.length, (d) => a.moveProject(p.id, d, active)),
      { label: 'アーカイブ', onSelect: () => a.archiveProject(p.id, true) },
      { label: '削除', danger: true, onSelect: () => a.deleteProject(p) },
    ]);
  const projectItem = (p: Project, i: number) => (
    <SideItem key={p.id} label={p.name} count={p.count} on={route.name === 'project' && route.id === p.id}
      onClick={() => navigate({ name: 'project', id: p.id })} onRename={(n) => a.renameProject(p.id, n)} menu={projectMenu(p, i)} />
  );

  return (
    <aside id="sidebar">
      <div className="side-brand">研究文献台帳</div>

      <h3>コレクション</h3>
      {BUILTINS.map((b) => (
        <SideItem key={b} label={BUILTIN_LABELS[b]} count={countFor(data.entries, builtinQuery(b, now), now)}
          on={isOn({ kind: 'builtin', id: b })} onClick={() => go({ kind: 'builtin', id: b })} />
      ))}

      <h3>保存フィルタ</h3>
      {!filters.length && <div className="side-note">フィルタバーの「フィルタを保存」で追加できます</div>}
      {filters.map((f, i) => (
        <SideItem key={f.id} label={f.name} count={countFor(data.entries, f.query, now)} on={isOn({ kind: 'saved', id: f.id })}
          onClick={() => go({ kind: 'saved', id: f.id })} onRename={(n) => a.renameFilter(f.id, n)}
          menu={[...upDown(i, filters.length, (d) => a.moveFilter(f.id, d)), { label: '削除', danger: true, onSelect: () => a.deleteFilter(f) }]} />
      ))}

      <h3 className="side-h">
        プロジェクト
        <button type="button" className="side-add" title="プロジェクトを追加" onClick={() => setAdding('project')}>＋</button>
      </h3>
      {adding === 'project' && (
        <InlineName initial="" placeholder="新しいプロジェクト名" onSubmit={(v) => { setAdding(null); a.addProject(v); }} onCancel={() => setAdding(null)} />
      )}
      {!projects.length && adding !== 'project' && <div className="side-note">プロジェクト未登録</div>}
      {active.map(projectItem)}
      {archived.length > 0 && (
        <details className="side-archived">
          <summary>アーカイブ ({archived.length})</summary>
          {archived.map(projectItem)}
        </details>
      )}

      <h3 className="side-h">
        タグ
        <button type="button" className="side-add" title="タグを追加" onClick={() => setAdding('tag')}>＋</button>
      </h3>
      {adding === 'tag' && (
        <InlineName initial="" placeholder="新しいタグ名" onSubmit={(v) => { setAdding(null); a.addTag(v); }} onCancel={() => setAdding(null)} />
      )}
      {!data.tags.length && adding !== 'tag' && <div className="side-note">タグ未登録</div>}
      {data.tags.map((t, i) => (
        <SideItem key={t} label={t} count={tagCount.get(t) ?? 0} on={isOn({ kind: 'tag', name: t })}
          onClick={() => go({ kind: 'tag', name: t })} onRename={(n) => a.renameTag(t, n)}
          menu={[...upDown(i, data.tags.length, (d) => a.moveTag(t, d)), { label: '削除', danger: true, onSelect: () => a.deleteTag(t) }]} />
      ))}

      <SidebarFooter route={route} />
    </aside>
  );
}
