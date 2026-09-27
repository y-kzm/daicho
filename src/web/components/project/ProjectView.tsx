import { useEffect, useMemo, useState } from 'react';
import { CITE_STATES } from '../../../shared/types';
import { projectEntryIds } from '../../lib/kanban';
import { isEditableTarget } from '../../lib/keys';
import { navigate } from '../../lib/router';
import { useAppData } from '../../state/AppDataContext';
import { BIBTEX_LIMIT, BIBTEX_LIMIT_MESSAGE } from '../../api';
import { useToast } from '../../state/useToast';
import { Kanban } from './Kanban';
import { ProjectHeader } from './ProjectHeader';
import { ProjectPanel } from './ProjectPanel';
import './project.css';

interface Props { projectId: number; onEdit: (id: number) => void; onBibtex: (ids: number[]) => void }

export function ProjectView({ projectId, onEdit, onBibtex }: Props) {
  const { data, projectById } = useAppData();
  const toast = useToast();
  const project = projectById(projectId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const ids = useMemo(() => projectEntryIds(data.entries, projectId, CITE_STATES), [data.entries, projectId]);

  // 選択中の論文がプロジェクトから外れたら詳細を閉じる
  useEffect(() => {
    setSelectedId((cur) => (cur !== null && !ids.includes(cur) ? null : cur));
  }, [ids]);

  // Esc で詳細を閉じる (入力中・ダイアログ表示中は各要素に任せる)
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || isEditableTarget(ev.target) || document.querySelector('dialog[open]')) return;
      setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!project) {
    return (
      <div className="pv-missing">
        <p>プロジェクトが見つかりません。</p>
        <button type="button" className="pv-btn" onClick={() => navigate({ name: 'library' })}>ライブラリへ戻る</button>
      </div>
    );
  }

  const openBibtex = (onlyCite: boolean) => {
    const target = onlyCite ? projectEntryIds(data.entries, projectId, ['引用する']) : ids;
    if (!target.length) { toast('対象のエントリがありません。', true); return; }
    if (target.length > BIBTEX_LIMIT) { toast(BIBTEX_LIMIT_MESSAGE, true); return; }
    onBibtex(target);
  };
  const select = (id: number) => setSelectedId((cur) => (cur === id ? null : id));

  return (
    <div className="pv">
      <div className="pv-main">
        <ProjectHeader project={project} count={ids.length}
          onBibtex={openBibtex} onPicked={(picked) => setSelectedId(picked[0] ?? null)} />
        <Kanban projectId={projectId} entries={data.entries} selectedId={selectedId} onSelect={select} />
      </div>
      <ProjectPanel key={projectId} project={project} entryId={selectedId}
        onCloseDetail={() => setSelectedId(null)} onEdit={onEdit} />
    </div>
  );
}
