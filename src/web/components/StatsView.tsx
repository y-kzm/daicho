import { useScope } from '../state/ScopeContext';
import { Stats } from './Stats';

/** #/stats と #/project/:id/stats。見出しは Shell の上部バーが出す。プロジェクトを開いていればその論文だけを集計する */
export function StatsView() {
  const { entries, scope } = useScope();
  return (
    <section aria-label="統計">
      {scope !== null && !entries.length
        ? <div className="empty">このプロジェクトには、まだ論文がありません</div>
        : <Stats entries={entries} />}
    </section>
  );
}
