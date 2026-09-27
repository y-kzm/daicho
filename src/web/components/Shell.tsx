import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BULK_MAX, CITE_STATES } from '../../shared/types';
import { BIBTEX_LIMIT, BIBTEX_LIMIT_MESSAGE } from '../api';
import { isPaletteShortcut } from '../lib/keys';
import { projectEntryIds } from '../lib/kanban';
import { navigate, type Route } from '../lib/router';
import { applyQuery, countFor, sourceLabel } from '../lib/smart';
import { useAppData } from '../state/AppDataContext';
import { useDialogs } from '../state/DialogContext';
import { useLibrary } from '../state/LibraryContext';
import { useToast } from '../state/useToast';
import { Palette } from './Palette';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface Props { route: Route; children: ReactNode }

export function Shell({ route, children }: Props) {
  const { data, projectById } = useAppData();
  const { source, query, selectSource, setDetailId } = useLibrary();
  const { open } = useDialogs();
  const toast = useToast();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const now = useMemo(() => new Date(), [data]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!isPaletteShortcut(ev)) return;
      ev.preventDefault();
      // 他のモーダル (編集中のダイアログなど) の上には重ねない
      if (!document.querySelector('dialog[open]')) setPaletteOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const runCommand = (id: string) => {
    switch (id) {
      case 'add':
        open({ kind: 'entry', id: null });
        break;
      case 'bibtex': {
        // プロジェクト画面では「現在の一覧」= そのプロジェクトの全エントリ
        const ids = route.name === 'project'
          ? projectEntryIds(data.entries, route.id, CITE_STATES)
          : applyQuery(data.entries, query, now).map((e) => e.id);
        if (route.name === 'project' && !ids.length) toast('対象のエントリがありません。', true);
        else if (ids.length > BIBTEX_LIMIT) toast(BIBTEX_LIMIT_MESSAGE, true);
        else open({ kind: 'bibtex', ids });
        break;
      }
      case 'duplicates':
        open({ kind: 'merge' });
        break;
      case 'aiTags': {
        const ids = data.entries.filter((e) => !e.tags.length).map((e) => e.id).slice(0, BULK_MAX);
        if (!ids.length) toast('対象のエントリがありません。', true);
        else open({ kind: 'aiTags', ids });
        break;
      }
      case 'stats':
        navigate({ name: 'stats' });
        break;
      case 'library':
        selectSource({ kind: 'builtin', id: 'all' });
        navigate({ name: 'library' });
        break;
      default:
        break;
    }
  };
  const pickEntry = (id: number) => {
    navigate({ name: 'library' });
    setDetailId(id);
  };

  const project = route.name === 'project' ? projectById(route.id) : undefined;
  const title = route.name === 'stats' ? '統計' : route.name === 'project' ? project?.name ?? 'プロジェクト' : sourceLabel(source, data.savedFilters);
  const count = route.name === 'library' ? countFor(data.entries, query, now) : route.name === 'project' ? project?.count ?? null : data.entries.length;

  return (
    <div className="shell">
      <Sidebar route={route} />
      <div className="shell-main">
        <TopBar title={title} count={count} onOpenPalette={() => setPaletteOpen(true)} onAdd={() => open({ kind: 'entry', id: null })} />
        <main className="page">{children}</main>
      </div>
      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} onCommand={runCommand} onPickEntry={pickEntry} />
    </div>
  );
}
