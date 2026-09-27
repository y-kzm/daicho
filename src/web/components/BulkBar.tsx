import { useState } from 'react';
import type { BulkOp } from '../../shared/types';
import { BULK_MAX, CITE_STATES, PRIORITIES, PRIORITY_LABELS, READ_STATES } from '../../shared/types';
import { api, BIBTEX_LIMIT, BIBTEX_LIMIT_MESSAGE, BULK_LIMIT_MESSAGE } from '../api';
import { sortByOrder } from '../lib/order';
import { useAppData } from '../state/AppDataContext';
import { useDialogs } from '../state/DialogContext';
import { useScope } from '../state/ScopeContext';
import { useSelection } from '../state/SelectionContext';
import { useToast } from '../state/useToast';
import { BulkProjectForm, BulkTagForm } from './library/BulkForms';
import { Popover } from './Popover';

const PRIORITY_MENU = [...PRIORITIES].reverse();

/** 選択中の論文への一括操作 (契約 §8 の文言) */
export function BulkBar() {
  const { selected, clear } = useSelection();
  const { data, applyData } = useAppData();
  const { scope, project } = useScope();
  const { open } = useDialogs();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!selected.size) return null;

  const ids = [...selected];
  const tooMany = ids.length > BULK_MAX;
  const allStarred = data.entries.filter((e) => selected.has(e.id)).every((e) => e.starred);
  // 開いているプロジェクトは「引用状態」「外す」で扱うので、追加先の候補からは除く
  const projects = sortByOrder(data.projects).filter((p) => !p.archived && p.id !== scope);

  const run = async (op: BulkOp, done: string) => {
    if (busy) return;
    if (tooMany) { toast(BULK_LIMIT_MESSAGE, true); return; }
    setBusy(true);
    try {
      applyData(await api.bulk(ids, op));
      toast(done);
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const bibtex = () => {
    if (busy) return;
    if (ids.length > BIBTEX_LIMIT) { toast(BIBTEX_LIMIT_MESSAGE, true); return; }
    open({ kind: 'bibtex', ids });
  };
  const aiTags = () => {
    if (busy) return;
    if (tooMany) { toast(BULK_LIMIT_MESSAGE, true); return; }
    open({ kind: 'aiTags', ids });
  };
  const unproject = () => {
    if (busy || scope === null) return;
    if (tooMany) { toast(BULK_LIMIT_MESSAGE, true); return; }
    open({
      kind: 'confirm', title: 'プロジェクトから外す',
      body: `${ids.length} 件を「${project?.name ?? ''}」から外します。このプロジェクトでの引用状態とメモは消えます。論文そのものは残ります。`,
      confirmLabel: '外す',
      onConfirm: async () => { applyData(await api.bulk(ids, { type: 'unproject', projectId: scope })); clear(); toast('プロジェクトから外しました'); },
    });
  };
  const remove = () => {
    if (busy) return;
    if (tooMany) { toast(BULK_LIMIT_MESSAGE, true); return; }
    open({
      kind: 'confirm', title: '論文を削除', body: `${ids.length} 件の論文を削除します。元に戻せません。`, confirmLabel: '削除する',
      onConfirm: async () => { applyData(await api.bulk(ids, { type: 'delete' })); clear(); toast('削除しました'); },
    });
  };

  return (
    <div className="bulkbar" role="toolbar" aria-label="一括操作">
      <span className="bulk-count">{ids.length} 件選択</span>
      <span aria-disabled={busy} style={busy ? { pointerEvents: 'none', opacity: 0.6 } : undefined}>
        <Popover label="タグ" className="hbtn">
          {(close) => (
            <BulkTagForm onApply={(add, rm) => { close(); void run({ type: 'tags', add, remove: rm }, 'タグを更新しました'); }} />
          )}
        </Popover>
      </span>
      {scope !== null && (
        <span aria-disabled={busy} style={busy ? { pointerEvents: 'none', opacity: 0.6 } : undefined}>
          <Popover label="引用状態" className="hbtn">
            {(close) => (
              <div className="menu">
                {CITE_STATES.map((s) => (
                  <button key={s} type="button" className="menu-item"
                    onClick={() => { close(); void run({ type: 'project', projectId: scope, state: s }, `引用状態を「${s}」にしました`); }}>{s}</button>
                ))}
              </div>
            )}
          </Popover>
        </span>
      )}
      <span aria-disabled={busy} style={busy ? { pointerEvents: 'none', opacity: 0.6 } : undefined}>
        <Popover label={scope === null ? 'プロジェクトへ' : '別のプロジェクトへ'} className="hbtn">
          {(close) => (
            <BulkProjectForm projects={projects}
              onApply={(projectId, state) => { close(); void run({ type: 'project', projectId, state }, 'プロジェクトに追加しました'); }} />
          )}
        </Popover>
      </span>
      <span aria-disabled={busy} style={busy ? { pointerEvents: 'none', opacity: 0.6 } : undefined}>
        <Popover label="読了" className="hbtn">
          {(close) => (
            <div className="menu">
              {READ_STATES.map((s) => (
                <button key={s} type="button" className="menu-item"
                  onClick={() => { close(); void run({ type: 'read', state: s }, `読了状態を「${s}」にしました`); }}>{s}</button>
              ))}
            </div>
          )}
        </Popover>
      </span>
      <button type="button" className="hbtn" disabled={busy} title={allStarred ? '★ を外す' : '★ を付ける'}
        onClick={() => void run({ type: 'flags', starred: !allStarred }, allStarred ? '★ を外しました' : '★ を付けました')}>★</button>
      <button type="button" className="hbtn" disabled={busy} onClick={bibtex}>BibTeX</button>
      <span aria-disabled={busy} style={busy ? { pointerEvents: 'none', opacity: 0.6 } : undefined}>
        <Popover label="その他" className="hbtn" align="right">
          {(close) => (
            <div className="menu">
              <button type="button" className="menu-item" title="選択した論文のタグを AI に提案させる"
                onClick={() => { close(); aiTags(); }}>AI にタグを提案させる</button>
              <div className="menu-note">優先度</div>
              {PRIORITY_MENU.map((p) => (
                <button key={p} type="button" className="menu-item"
                  onClick={() => { close(); void run({ type: 'flags', priority: p }, '優先度を変更しました'); }}>
                  {p === 0 ? 'なし' : PRIORITY_LABELS[p]}
                </button>
              ))}
              <div className="menu-sep" />
              {scope !== null && (
                <button type="button" className="menu-item" onClick={() => { close(); unproject(); }}>プロジェクトから外す</button>
              )}
              <button type="button" className="menu-item danger" onClick={() => { close(); remove(); }}>削除</button>
            </div>
          )}
        </Popover>
      </span>
      <span className="spacer" />
      <button type="button" className="linkbtn" onClick={clear}>選択解除</button>
    </div>
  );
}
