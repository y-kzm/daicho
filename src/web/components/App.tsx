import { useRoute, type Route } from '../lib/router';
import { DialogProvider, useDialogs } from '../state/DialogContext';
import { LibraryProvider } from '../state/LibraryContext';
import { AppDialogs } from './AppDialogs';
import { LibraryView } from './library/LibraryView';
import { ProjectView } from './project/ProjectView';
import { Shell } from './Shell';
import { StatsView } from './StatsView';

export type { DialogState } from '../state/DialogContext';

export function App() {
  return (
    <LibraryProvider>
      <DialogProvider>
        <Routes />
      </DialogProvider>
    </LibraryProvider>
  );
}

function Routes() {
  const route = useRoute();
  return (
    <>
      <Shell route={route}><RouteBody route={route} /></Shell>
      <AppDialogs />
    </>
  );
}

function RouteBody({ route }: { route: Route }) {
  const { open } = useDialogs();
  if (route.name === 'stats') return <StatsView />;
  if (route.name === 'project') {
    // key: 別プロジェクトへ移ったときに選択・メモ入力状態を作り直す
    return (
      <ProjectView key={route.id} projectId={route.id}
        onEdit={(id) => open({ kind: 'entry', id })}
        onBibtex={(ids) => open({ kind: 'bibtex', ids })} />
    );
  }
  return <LibraryView />;
}
