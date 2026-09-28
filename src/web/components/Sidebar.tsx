import { useMemo, useState } from 'react';
import type { Project } from '../../shared/types';
import { KIND_GROUPS } from '../../shared/types';
import { sortByOrder } from '../lib/order';
import { navigate, withScope, type Route } from '../lib/router';
import { BUILTIN_LABELS, BUILTINS, builtinQuery, countFor, sameSource, type Builtin, type LibrarySource } from '../lib/smart';
import { useAppData } from '../state/AppDataContext';
import { useLibrary } from '../state/LibraryContext';
import { useScope } from '../state/ScopeContext';
import { Popover } from './Popover';
import { InlineName } from './sidebar/InlineName';
import { ScopeSwitcher } from './sidebar/ScopeSwitcher';
import { SideItem, type MenuAction } from './sidebar/SideItem';
import { SidebarFooter } from './sidebar/SidebarFooter';
import { useSidebarActions } from './sidebar/useSidebarActions';

/** プロジェクトの中では「未分類」が成り立たず、「ライブラリ」は「一覧」として別に出す */
const SCOPED_BUILTINS: Builtin[] = BUILTINS.filter((b) => b !== 'all' && b !== 'unfiled');
const ALL: LibrarySource = { kind: 'builtin', id: 'all' };

export function Sidebar({ route }: { route: Route }) {
  const { data } = useAppData();
  const { scope, project, entries, tags, tagCount, apply } = useScope();
  const { source, selectSource } = useLibrary();
  const a = useSidebarActions();
  const [adding, setAdding] = useState<'project' | 'tag' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const now = useMemo(() => new Date(), [data]);
  const filters = useMemo(() => sortByOrder(data.savedFilters), [data.savedFilters]);
  const projects = useMemo(() => sortByOrder(data.projects), [data.projects]);
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  const inProject = scope !== null;

  const library: Route = withScope({ name: 'library' }, scope);
  const isOn = (src: LibrarySource) => route.name === 'library' && sameSource(source, src);
  const go = (src: LibrarySource) => { selectSource(src); navigate(library); };
  const count = (q: Parameters<typeof apply>[0]) => countFor(entries, apply(q), now);
  const enter = (id: number | null) => navigate(withScope(route.name === 'stats' ? route : { name: 'library' }, id));
  const upDown = (i: number, n: number, move: (d: -1 | 1) => void): MenuAction[] => [
    { label: '上へ', disabled: i === 0, onSelect: () => move(-1) },
    { label: '下へ', disabled: i === n - 1, onSelect: () => move(1) },
  ];
  /** プロジェクトの `…` メニュー (「名前を変更」は SideItem が先頭に足す) */
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
    <SideItem key={p.id} label={p.name} count={p.count} on={false}
      onClick={() => enter(p.id)} onRename={(n) => a.renameProject(p.id, n)} menu={projectMenu(p, i)} />
  );
  const newProject = adding === 'project' && (
    <InlineName initial="" placeholder="新しいプロジェクト名" onSubmit={(v) => { setAdding(null); a.addProject(v); }} onCancel={() => setAdding(null)} />
  );

  return (
    <aside id="sidebar">
      <div className="side-brand"><img src="/favicon.svg" alt="" width="22" height="22" />研究文献台帳</div>

      <ScopeSwitcher scope={scope} current={project} total={data.entries.length} active={active} archived={archived}
        onSelect={enter} onAdd={() => setAdding('project')} />
      {inProject && newProject}

      {inProject && project && (
        <>
          {renaming ? (
            <InlineName initial={project.name} placeholder="プロジェクト名"
              onSubmit={(v) => { setRenaming(false); if (v !== project.name) a.renameProject(project.id, v); }}
              onCancel={() => setRenaming(false)} />
          ) : (
            <div className="side-row has-menu scope-head">
              <h3>このプロジェクト{project.archived ? ' (アーカイブ済み)' : ''}</h3>
              <SideMenu actions={[
                { label: '名前を変更', onSelect: () => setRenaming(true) },
                { label: project.archived ? 'アーカイブ解除' : 'アーカイブ', onSelect: () => a.archiveProject(project.id, !project.archived) },
                { label: '削除', danger: true, onSelect: () => a.deleteProject(project) },
              ]} />
            </div>
          )}
          <SideItem label="一覧" count={entries.length} on={isOn(ALL)} onClick={() => go(ALL)} />
          <SideItem label="カンバン" on={route.name === 'project'} onClick={() => navigate({ name: 'project', id: project.id })} />
          <SideItem label="統計" on={route.name === 'stats'} onClick={() => navigate({ name: 'stats', scope: project.id })} />
        </>
      )}

      <h3>コレクション</h3>
      {(inProject ? SCOPED_BUILTINS : BUILTINS).map((b) => (
        <SideItem key={b} label={BUILTIN_LABELS[b]} count={count(builtinQuery(b, now))}
          on={isOn({ kind: 'builtin', id: b })} onClick={() => go({ kind: 'builtin', id: b })} />
      ))}

      <h3>種類</h3>
      {KIND_GROUPS.map((g) => (
        <SideItem key={g.id} label={g.label} count={count({ kinds: [...g.kinds] })}
          on={isOn({ kind: 'kinds', id: g.id })} onClick={() => go({ kind: 'kinds', id: g.id })} />
      ))}

      <h3>保存フィルタ</h3>
      {!filters.length && <div className="side-note">絞り込んだあとに「フィルタを保存」を押すと、ここに追加されます</div>}
      {filters.map((f, i) => (
        <SideItem key={f.id} label={f.name} count={count(f.query)} on={isOn({ kind: 'saved', id: f.id })}
          onClick={() => go({ kind: 'saved', id: f.id })} onRename={(n) => a.renameFilter(f.id, n)}
          menu={[...upDown(i, filters.length, (d) => a.moveFilter(f.id, d)), { label: '削除', danger: true, onSelect: () => a.deleteFilter(f) }]} />
      ))}

      {!inProject && (
        <>
          <h3 className="side-h">
            プロジェクト
            <button type="button" className="side-add" title="プロジェクトを追加" onClick={() => setAdding('project')}>＋</button>
          </h3>
          {newProject}
          {!projects.length && adding !== 'project' && <div className="side-note">プロジェクト未登録</div>}
          {active.map(projectItem)}
          {archived.length > 0 && (
            <details className="side-archived">
              <summary>アーカイブ ({archived.length})</summary>
              {archived.map(projectItem)}
            </details>
          )}
        </>
      )}

      <h3 className="side-h">
        タグ
        {!inProject && <button type="button" className="side-add" title="タグを追加" onClick={() => setAdding('tag')}>＋</button>}
      </h3>
      {adding === 'tag' && (
        <InlineName initial="" placeholder="新しいタグ名" onSubmit={(v) => { setAdding(null); a.addTag(v); }} onCancel={() => setAdding(null)} />
      )}
      {!tags.length && adding !== 'tag' && (
        <div className="side-note">{inProject ? 'このプロジェクトの論文にはタグがありません' : 'タグ未登録'}</div>
      )}
      {tags.map((t) => {
        const i = data.tags.indexOf(t);
        return (
          <SideItem key={t} label={t} count={tagCount.get(t) ?? 0} on={isOn({ kind: 'tag', name: t })}
            onClick={() => go({ kind: 'tag', name: t })}
            onRename={inProject ? undefined : (n) => a.renameTag(t, n)}
            menu={inProject ? [] : [...upDown(i, data.tags.length, (d) => a.moveTag(t, d)), { label: '削除', danger: true, onSelect: () => a.deleteTag(t) }]} />
        );
      })}
      {inProject && tags.length > 0 && (
        <div className="side-note">このプロジェクトで使っているタグだけを表示しています。タグの追加や並べ替えは「すべての文献」で行います。</div>
      )}

      <SidebarFooter route={route} showStats={!inProject} />
    </aside>
  );
}

function SideMenu({ actions }: { actions: MenuAction[] }) {
  return (
    <Popover label="…" className="side-more" title="メニュー" align="right">
      {(close) => (
        <div className="menu">
          {actions.map((x) => (
            <button key={x.label} type="button" className={'menu-item' + (x.danger ? ' danger' : '')} disabled={x.disabled}
              onClick={() => { close(); x.onSelect(); }}>
              {x.label}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
