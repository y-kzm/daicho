import { useAppData } from '../state/AppDataContext';
import { Stats } from './Stats';

/** #/stats。見出しは Shell の上部バー (「統計」) が出す。 */
export function StatsView() {
  const { data } = useAppData();
  return (
    <section aria-label="統計">
      <Stats entries={data.entries} />
    </section>
  );
}
