import { useState } from 'react';
import type { CiteState, Project } from '../../../shared/types';
import { CITE_STATES } from '../../../shared/types';
import { useAppData } from '../../state/AppDataContext';
import { TagPicker } from '../dialogs/TagPicker';

/** 一括タグ: 付ける / 外す を選び、TagPicker で対象タグを選ぶ */
export function BulkTagForm({ onApply }: { onApply: (add: string[], remove: string[]) => void }) {
  const { data } = useAppData();
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  return (
    <div className="bulk-form">
      <div className="seg" role="group" aria-label="タグの操作">
        <button type="button" className={mode === 'add' ? 'on' : ''} onClick={() => setMode('add')}>付ける</button>
        <button type="button" className={mode === 'remove' ? 'on' : ''} onClick={() => setMode('remove')}>外す</button>
      </div>
      <TagPicker tags={data.tags} selected={picked} onToggle={toggle} />
      <div className="menu-actions">
        <button type="button" className="hbtn primary" disabled={!picked.length}
          onClick={() => onApply(mode === 'add' ? picked : [], mode === 'remove' ? picked : [])}>
          適用
        </button>
      </div>
    </div>
  );
}

/** 一括プロジェクト追加: プロジェクトと引用状態を選ぶ */
export function BulkProjectForm({ projects, onApply }: { projects: Project[]; onApply: (projectId: number, state: CiteState) => void }) {
  const [pid, setPid] = useState<number | ''>(projects[0]?.id ?? '');
  const [state, setState] = useState<CiteState>('気になる');
  if (!projects.length) {
    return <div className="menu"><div className="menu-note">プロジェクトがありません。サイドバーの ＋ から追加してください。</div></div>;
  }
  return (
    <div className="bulk-form">
      <div className="bulk-row">
        <select aria-label="プロジェクト" value={pid} onChange={(ev) => setPid(ev.target.value ? Number(ev.target.value) : '')}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="引用状態" value={state} onChange={(ev) => setState(ev.target.value as CiteState)}>
          {CITE_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="menu-actions">
        <button type="button" className="hbtn primary" disabled={pid === ''} onClick={() => { if (pid !== '') onApply(pid, state); }}>追加</button>
      </div>
    </div>
  );
}
