import { useCallback, useEffect, useState } from 'react';
import type { DuplicateGroup, Entry } from '../../../shared/types';
import { api } from '../../api';
import { venueOf } from '../../lib/table';
import { useAppData } from '../../state/AppDataContext';
import { useToast } from '../../state/useToast';
import { Modal } from '../Modal';

interface Props { open: boolean; onClose: () => void }

const KIND_LABEL: Record<DuplicateGroup['kind'], string> = { title: 'タイトル', doi: 'DOI', bibkey: 'BibTeX キー' };
const groupId = (g: DuplicateGroup) => `${g.kind}:${g.key}`;

export function MergeDialog(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} id="mergeDialog">
      <MergeDialogBody {...props} />
    </Modal>
  );
}

function MergeDialogBody({ onClose }: Props) {
  const { data, applyData } = useAppData();
  const toast = useToast();
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [keep, setKeep] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const g = await api.duplicates();
      setGroups(g);
      setKeep((prev) => {
        const next = { ...prev };
        for (const x of g) {
          const k = groupId(x);
          const current = next[k];
          if (current === undefined || !x.ids.includes(current)) next[k] = x.ids[0] ?? 0;
        }
        return next;
      });
    } catch (err) {
      toast((err as Error).message, true);
      setGroups([]);
    }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const byId = new Map(data.entries.map((e) => [e.id, e]));
  const merge = async (g: DuplicateGroup) => {
    const id = groupId(g);
    const keepId = keep[id] ?? g.ids[0];
    if (keepId === undefined) return;
    setBusy(id);
    try {
      applyData(await api.merge(keepId, g.ids.filter((x) => x !== keepId)));
      toast('マージしました');
      await load();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="inner">
      <h2>重複をマージ</h2>
      <div className="side-note" style={{ padding: '0 0 10px' }}>
        グループごとに「残す」行を選んで「マージ」を押します。タグ・プロジェクト所属・★・優先度は残す行に統合され、ほかの行は削除されます。
      </div>
      {groups === null && <div className="side-note"><span className="spin" />重複を探しています…</div>}
      {groups !== null && !groups.length && <div className="empty">重複は見つかりませんでした</div>}
      {groups?.map((g) => {
        const id = groupId(g);
        const rows = g.ids.map((x) => byId.get(x)).filter((e): e is Entry => e !== undefined);
        return (
          <div className="merge-group" key={id}>
            <div className="mg-head">
              <span>{KIND_LABEL[g.kind]} が一致: <span className="mono">{g.key}</span></span>
              <button type="button" className="hbtn primary" disabled={busy !== null || rows.length < 2} onClick={() => void merge(g)}>
                {busy === id ? 'マージ中…' : 'マージ'}
              </button>
            </div>
            <table className="mg-table">
              <thead>
                <tr><th>残す</th><th>タイトル</th><th>年</th><th>会議・誌名</th><th>タグ</th><th>追加日</th></tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <input type="radio" name={id} aria-label={`「${e.title}」を残す`} checked={(keep[id] ?? g.ids[0]) === e.id}
                        onChange={() => setKeep((k) => ({ ...k, [id]: e.id }))} />
                    </td>
                    <td>{e.title}</td>
                    <td className="mono">{e.year}</td>
                    <td>{venueOf(e)}</td>
                    <td>{e.tags.join('・')}</td>
                    <td className="mono">{e.added}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="dialog-actions">
        <button type="button" className="cancel" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
