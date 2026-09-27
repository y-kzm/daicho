import { useState } from 'react';
import type { LlmProvider, TagProposal } from '../../../shared/types';
import { api } from '../../api';
import { useAppData } from '../../state/AppDataContext';
import { useToast } from '../../state/useToast';
import { Modal } from '../Modal';
import { ProviderSelect } from './EntryDialogTools';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 提案の対象 (一括操作バーからは選択中の論文、パレットからはタグの無い論文) */
  ids: number[];
}
const CHUNK = 12;

const sameTags = (a: string[], b: string[]) => [...a].sort().join('|') === [...b].sort().join('|');

export function BulkTagDialog(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} id="bulkTagDialog">
      <BulkTagDialogBody {...props} />
    </Modal>
  );
}

function BulkTagDialogBody({ onClose, ids }: Props) {
  const { applyData } = useAppData();
  const toast = useToast();
  const [provider, setProvider] = useState<LlmProvider>('claude');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [proposals, setProposals] = useState<TagProposal[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);

  const start = async () => {
    const target = [...ids].sort((a, b) => a - b);
    if (!target.length) { toast('対象のエントリがありません。', true); return; }
    const chunks: number[][] = [];
    for (let i = 0; i < target.length; i += CHUNK) chunks.push(target.slice(i, i + CHUNK));
    setRunning(true);
    setProposals([]);
    setChecked(new Set());
    const acc: TagProposal[] = [];
    for (let i = 0; i < chunks.length; i++) {
      setProgress('生成中… ' + (i + 1) + ' / ' + chunks.length + ' バッチ');
      try {
        acc.push(...(await api.llmTagsBatch(chunks[i]!, provider)));
        setProposals([...acc]);
        setChecked(new Set(acc.filter((p) => !sameTags(p.current, p.proposed)).map((p) => p.id)));
      } catch (err) {
        setProgress('中断 (エラー): ' + (err as Error).message);
        setRunning(false);
        return;
      }
    }
    setProgress('完了');
    setRunning(false);
  };

  const apply = async () => {
    const payload = proposals.filter((p) => checked.has(p.id)).map((p) => ({ id: p.id, tags: p.proposed }));
    if (!payload.length) return;
    setApplying(true);
    try {
      applyData(await api.applyTagProposals(payload));
      toast(payload.length + ' 件のタグを更新しました');
      onClose();
    } catch (err) { toast((err as Error).message, true); }
    finally { setApplying(false); }
  };

  const toggle = (id: number) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="inner">
      <h2>AI による一括タグ提案</h2>
      <div className="side-note" style={{ padding: '0 0 8px' }}>対象 {ids.length} 件のタイトル・概要から、既存タグの中で該当するものを AI が提案します。</div>
      <div className="bibopts" style={{ marginBottom: 10 }}>
        <ProviderSelect id="bulkProvider" value={provider} onChange={setProvider} />
        <button className="sbtn" disabled={running || !ids.length} onClick={() => void start()}>提案を生成する</button>
        <span id="bulkProgress" className="side-note">{progress}</span>
      </div>
      <div id="bulkRows" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
        {!proposals.length && (
          <div className="side-note">
            {progress ? '提案はまだありません。' : '「提案を生成する」を押すと対象 ' + ids.length + ' 件を数件ずつ AI に渡して提案を作ります。'}
          </div>
        )}
        {proposals.map((p) => {
          const changed = !sameTags(p.current, p.proposed);
          return (
            <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 4px', borderBottom: '1px solid var(--line-soft)', fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" style={{ marginTop: 2 }} disabled={!changed} checked={changed && checked.has(p.id)} onChange={() => toggle(p.id)} />
              <div>
                <div style={{ fontWeight: 600 }}>{p.title.length > 70 ? p.title.slice(0, 70) + '…' : p.title}</div>
                <div style={{ color: 'var(--ink-soft)' }}>
                  {(p.current.length ? p.current.join('・') : '(タグなし)') + '  →  ' + (p.proposed.length ? p.proposed.join('・') : '(タグなし)') + (changed ? '' : ' (変更なし)')}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <div className="dialog-actions">
        <button type="button" className="cancel" onClick={onClose}>閉じる</button>
        <button type="button" className="submit" disabled={applying || !checked.size} onClick={() => void apply()}>チェックした提案を適用</button>
      </div>
    </div>
  );
}
