import { useRef, useState } from 'react';
import type { Project } from '../../../shared/types';
import { useAppData } from '../../state/AppDataContext';
import { useToast } from '../../state/useToast';
import { AddEntryPicker } from './AddEntryPicker';
import { renameProject, setProjectArchived } from './projectActions';

export type ProjectViewMode = 'kanban' | 'table';

interface Props {
  project: Project;
  count: number;
  view: ProjectViewMode;
  onView: (v: ProjectViewMode) => void;
  onBibtex: (onlyCite: boolean) => void;
  onPicked: (ids: number[]) => void;
}

export function ProjectHeader({ project, count, view, onView, onBibtex, onPicked }: Props) {
  const { reload } = useAppData();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const cancelled = useRef(false);

  const startEdit = () => { cancelled.current = false; setName(project.name); setEditing(true); };
  const finishEdit = async () => {
    setEditing(false);
    if (cancelled.current) { setName(project.name); return; }
    const ok = await renameProject(project, name, { reload, toast });
    if (!ok) setName(project.name);
  };

  return (
    <div className="pv-head">
      <div className="pv-title">
        {editing ? (
          <input className="pv-name-input" autoFocus value={name} aria-label="プロジェクト名"
            onChange={(ev) => setName(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.nativeEvent.isComposing) return;
              if (ev.key === 'Enter') ev.currentTarget.blur();
              if (ev.key === 'Escape') { cancelled.current = true; ev.currentTarget.blur(); }
            }}
            onBlur={() => void finishEdit()} />
        ) : (
          <h2 className="pv-name">
            <button type="button" title="クリックで改名" onClick={startEdit}>{project.name}</button>
          </h2>
        )}
        <span className="pv-count">{count} 件</span>
        {project.archived && <span className="pv-badge">アーカイブ済み</span>}
      </div>
      <div className="pv-actions">
        <div className="pv-seg" role="group" aria-label="表示切替">
          <button type="button" className={view === 'kanban' ? 'on' : ''} aria-pressed={view === 'kanban'} onClick={() => onView('kanban')}>カンバン</button>
          <button type="button" className={view === 'table' ? 'on' : ''} aria-pressed={view === 'table'} onClick={() => onView('table')}>テーブル</button>
        </div>
        <AddEntryPicker projectId={project.id} onPicked={onPicked} />
        <button type="button" className="pv-btn" onClick={() => onBibtex(true)}>BibTeX (引用する のみ)</button>
        <button type="button" className="pv-btn" onClick={() => onBibtex(false)}>BibTeX (全部)</button>
        <button type="button" className="pv-btn" onClick={() => void setProjectArchived(project, !project.archived, { reload, toast })}>
          {project.archived ? 'アーカイブ解除' : 'アーカイブ'}
        </button>
      </div>
    </div>
  );
}
