import { useEffect, useState } from 'react';
import type { CiteState, Entry } from '../../../shared/types';
import { CITE_STATES } from '../../../shared/types';
import { api } from '../../api';
import { sortByOrder } from '../../lib/order';
import { navigate } from '../../lib/router';
import { useAppData } from '../../state/AppDataContext';
import { useToast } from '../../state/useToast';

interface Props { e: Entry; projectId?: number }

export function DetailProjects({ e, projectId }: Props) {
  const { data, patchEntry, reload } = useAppData();
  const toast = useToast();
  const [addId, setAddId] = useState<number | ''>('');
  const [addState, setAddState] = useState<CiteState>('気になる');
  const current = projectId === undefined ? undefined : e.cites[String(projectId)];
  const [memo, setMemo] = useState(current?.memo ?? '');
  useEffect(() => setMemo(current?.memo ?? ''), [current?.memo]);

  const projects = sortByOrder(data.projects);
  const memberships = projects.filter((p) => e.cites[String(p.id)]);
  const candidates = projects.filter((p) => !e.cites[String(p.id)]);

  const setState = async (pid: number, state: string) => {
    try {
      await api.setCite(e.id, pid, state);
      await reload(); // プロジェクトの件数も変わるので全体を取り直す
    } catch (err) {
      toast((err as Error).message, true);
    }
  };
  const add = async () => {
    if (addId === '') return;
    await setState(addId, addState);
    setAddId('');
  };
  const saveMemo = async () => {
    if (projectId === undefined || !current || current.memo === memo) return;
    try {
      await api.updateProjectEntry(projectId, e.id, { memo });
      patchEntry(e.id, { cites: { ...e.cites, [String(projectId)]: { ...current, memo } } });
      toast('メモを保存しました');
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  return (
    <section className="dp-sec">
      <h3>プロジェクト</h3>
      {!memberships.length && <div className="side-note" style={{ padding: 0 }}>どのプロジェクトにも入っていません</div>}
      <ul className="dp-projects">
        {memberships.map((p) => {
          const info = e.cites[String(p.id)]!;
          return (
            <li key={p.id}>
              <button type="button" className="linkbtn" onClick={() => navigate({ name: 'project', id: p.id })}>{p.name}</button>
              <select className={'cite c' + info.state} aria-label={`${p.name} での引用状態`} value={info.state}
                onChange={(ev) => void setState(p.id, ev.target.value)}>
                {CITE_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type="button" className="sbtn danger" title="プロジェクトから外す" onClick={() => void setState(p.id, '')}>外す</button>
            </li>
          );
        })}
      </ul>
      {candidates.length > 0 && (
        <div className="dp-add">
          <select aria-label="追加するプロジェクト" value={addId} onChange={(ev) => setAddId(ev.target.value ? Number(ev.target.value) : '')}>
            <option value="">プロジェクトに追加…</option>
            {candidates.map((p) => <option key={p.id} value={p.id}>{p.archived ? `${p.name} (アーカイブ)` : p.name}</option>)}
          </select>
          <select aria-label="引用状態" value={addState} onChange={(ev) => setAddState(ev.target.value as CiteState)}>
            {CITE_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" className="sbtn" disabled={addId === ''} onClick={() => void add()}>追加</button>
        </div>
      )}
      {projectId !== undefined && current && (
        <label className="dp-memo">
          このプロジェクトでの使い方
          <textarea value={memo} placeholder="例: 関連研究 2 章で引用" onChange={(ev) => setMemo(ev.target.value)} onBlur={() => void saveMemo()} />
        </label>
      )}
    </section>
  );
}
