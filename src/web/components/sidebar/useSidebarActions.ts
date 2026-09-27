import type { Project, SavedFilter } from '../../../shared/types';
import { api } from '../../api';
import { moveItem, moveWithinGroup, sortByOrder } from '../../lib/order';
import { navigate, scopeOf, useRoute } from '../../lib/router';
import { useAppData } from '../../state/AppDataContext';
import { useDialogs } from '../../state/DialogContext';
import { useLibrary } from '../../state/LibraryContext';
import { useToast } from '../../state/useToast';

/** サイドバーの `…` メニューと ＋ ボタンの処理 */
export function useSidebarActions() {
  const { data, applyData, reload } = useAppData();
  const { source, selectSource } = useLibrary();
  const { open } = useDialogs();
  const toast = useToast();
  const route = useRoute();

  const act = (fn: () => Promise<void>, done?: string) => {
    void (async () => {
      try {
        await fn();
        if (done) toast(done);
      } catch (err) {
        toast((err as Error).message, true);
      }
    })();
  };
  const confirmDelete = (title: string, body: string, run: () => Promise<void>) =>
    open({ kind: 'confirm', title, body, confirmLabel: '削除する', onConfirm: async () => { await run(); toast('削除しました'); } });

  const tagCount = (t: string) => data.entries.filter((e) => e.tags.includes(t)).length;
  const filterIds = sortByOrder(data.savedFilters).map((f) => f.id);
  const projectIds = sortByOrder(data.projects).map((p) => p.id);

  return {
    addTag: (name: string) => act(async () => applyData(await api.addTag(name)), 'タグを追加しました'),
    renameTag: (from: string, to: string) => act(async () => {
      applyData(await api.renameTag(from, to));
      if (source.kind === 'tag' && source.name === from) selectSource({ kind: 'tag', name: to });
    }, '変更しました'),
    moveTag: (name: string, delta: -1 | 1) =>
      act(async () => applyData(await api.reorderTags(moveItem(data.tags, data.tags.indexOf(name), delta)))),
    deleteTag: (name: string) =>
      confirmDelete('タグを削除', `タグ「${name}」を削除します。${tagCount(name)} 件の論文からも外れます。`,
        async () => applyData(await api.deleteTag(name))),

    renameFilter: (id: number, name: string) => act(async () => { await api.updateFilter(id, { name }); await reload(); }, '変更しました'),
    moveFilter: (id: number, delta: -1 | 1) =>
      act(async () => { await api.reorderFilters(moveItem(filterIds, filterIds.indexOf(id), delta)); await reload(); }),
    deleteFilter: (f: SavedFilter) =>
      confirmDelete('保存フィルタを削除', `「${f.name}」を削除します。論文は削除されません。`,
        async () => { await api.deleteFilter(f.id); await reload(); }),

    addProject: (name: string) => act(async () => {
      const { id } = await api.addProject(name);
      await reload();
      navigate({ name: 'library', scope: id });
    }, 'プロジェクトを追加しました'),
    renameProject: (id: number, name: string) => act(async () => { await api.updateProject(id, { name }); await reload(); }, '変更しました'),
    moveProject: (id: number, delta: -1 | 1, group: Project[]) => act(async () => {
      await api.reorderProjects(moveWithinGroup(projectIds, group.map((p) => p.id), id, delta));
      await reload();
    }),
    archiveProject: (id: number, archived: boolean) =>
      act(async () => { await api.updateProject(id, { archived }); await reload(); }, archived ? 'アーカイブしました' : 'アーカイブを解除しました'),
    deleteProject: (p: Project) =>
      confirmDelete('プロジェクトを削除', `「${p.name}」を削除します。所属 (引用状態・メモ) も消えます。論文自体は残ります。`, async () => {
        await api.deleteProject(p.id);
        await reload();
        if (scopeOf(route) === p.id) navigate({ name: 'library' }, { replace: true });
      }),
  };
}
