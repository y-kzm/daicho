import { useEffect } from 'react';
import { navigate, scopeOf, useRoute, withScope, type Route } from '../lib/router';
import { useAppData } from '../state/AppDataContext';
import { DialogProvider, useDialogs } from '../state/DialogContext';
import { LibraryProvider } from '../state/LibraryContext';
import { ScopeProvider } from '../state/ScopeContext';
import { AppDialogs } from './AppDialogs';
import { LibraryView } from './library/LibraryView';
import { ProjectView } from './project/ProjectView';
import { Shell } from './Shell';
import { StatsView } from './StatsView';
import { VenuesProvider } from '../venues/VenuesContext';
import { VenuesView } from '../venues/VenuesView';

export type { DialogState } from '../state/DialogContext';

export function App() {
  const route = useRoute();
  const { projectById } = useAppData();
  const wanted = scopeOf(route);
  const missing = wanted !== null && !projectById(wanted);
  // 一覧・統計が削除済みのプロジェクトを指していたら全体へ戻す (カンバンは「見つかりません」を出す)
  useEffect(() => {
    if (missing && route.name !== 'project') navigate(withScope(route, null), { replace: true });
  }, [missing, route]);
  const scope = missing ? null : wanted;

  return (
    <DialogProvider>
      <ScopeProvider scope={scope}>
        {/* key: 範囲ごとに絞り込み・開いている詳細を別々に持つ */}
        <LibraryProvider key={scope ?? 'all'} scope={scope}>
          <VenuesProvider active={route.name === 'venues'}>
            <Shell route={route}><RouteBody route={route} /></Shell>
          </VenuesProvider>
          <AppDialogs />
        </LibraryProvider>
      </ScopeProvider>
    </DialogProvider>
  );
}

function RouteBody({ route }: { route: Route }) {
  const { open } = useDialogs();
  if (route.name === 'stats') return <StatsView />;
  // key: 国際会議と論文誌を行き来したときに、選択と表示の状態を作り直す
  if (route.name === 'venues') return <VenuesView key={route.kind} kind={route.kind} />;
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
