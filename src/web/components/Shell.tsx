import { VENUE_KIND_LABELS } from '../../shared/venues';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BULK_MAX, CITE_STATES } from '../../shared/types';
import { BIBTEX_LIMIT, BIBTEX_LIMIT_MESSAGE } from '../api';
import { isPaletteShortcut } from '../lib/keys';
import { projectEntryIds } from '../lib/kanban';
import { navigate, withScope, type Route } from '../lib/router';
import { applyQuery, countFor, sourceLabel } from '../lib/smart';
import { useScope } from '../state/ScopeContext';
import { useAppData } from '../state/AppDataContext';
import { useDialogs } from '../state/DialogContext';
import { useLibrary } from '../state/LibraryContext';
import { useToast } from '../state/useToast';
import { Palette } from './Palette';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface Props { route: Route; children: ReactNode }

export function Shell({ route, children }: Props) {
  const { data } = useAppData();
  const { scope, project, entries, apply } = useScope();
  const { source, query, selectSource, openEntryIn } = useLibrary();
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
          : applyQuery(entries, apply(query), now).map((e) => e.id);
        if (route.name === 'project' && !ids.length) toast('対象のエントリがありません。', true);
        else if (ids.length > BIBTEX_LIMIT) toast(BIBTEX_LIMIT_MESSAGE, true);
        else open({ kind: 'bibtex', ids });
        break;
      }
      case 'duplicates':
        open({ kind: 'merge' });
        break;
      case 'aiTags': {
        const ids = entries.filter((e) => !e.tags.length).map((e) => e.id).slice(0, BULK_MAX);
        if (!ids.length) toast('対象のエントリがありません。', true);
        else open({ kind: 'aiTags', ids });
        break;
      }
      case 'stats':
        navigate(withScope({ name: 'stats' }, scope));
        break;
      case 'library':
        selectSource({ kind: 'builtin', id: 'all' });
        navigate(withScope({ name: 'library' }, scope));
        break;
      default:
        break;
    }
  };
  // プロジェクトの論文はその一覧で、それ以外は全体の一覧で開く
  const pickEntry = (id: number) => {
    const inside = scope !== null && entries.some((e) => e.id === id);
    openEntryIn(inside ? scope : null, id);
  };

  const listTitle = scope !== null && source.kind === 'builtin' && source.id === 'all' ? '一覧' : sourceLabel(source, data.savedFilters);
  const inVenues = route.name === 'venues';
  const title = route.name === 'venues' ? VENUE_KIND_LABELS[route.kind] : route.name === 'stats' ? '統計' : route.name === 'project' ? 'カンバン' : listTitle;
  const missingBoard = route.name === 'project' && scope === null;
  const count = missingBoard || inVenues ? null : route.name === 'library' ? countFor(entries, apply(query), now) : entries.length;

  return (
    <div className="shell">
      <Sidebar route={route} />
      <div className="shell-main">
        <TopBar title={title} scopeName={scope === null || inVenues ? undefined : project?.name} count={count}
          addLabel={scope === null ? '+ 追加' : '+ このプロジェクトに追加'}
          onOpenPalette={() => setPaletteOpen(true)} onAdd={() => open({ kind: 'entry', id: null })} />
        <main className="page">{children}</main>
      </div>
      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} onCommand={runCommand} onPickEntry={pickEntry} />
    </div>
  );
}
