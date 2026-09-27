import { useState, type FormEvent } from 'react';
import type { FilterQuery, SavedFilter } from '../../../shared/types';
import { api } from '../../api';
import { describeQuery } from '../../lib/smart';
import { useAppData } from '../../state/AppDataContext';
import { useToast } from '../../state/useToast';
import { Modal } from '../Modal';

interface Props {
  open: boolean;
  query: FilterQuery;
  editing: SavedFilter | null;
  onClose: () => void;
  onSaved: (id: number, query: FilterQuery) => void;
}

export function SaveFilterDialog(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} id="saveFilterDialog">
      <SaveFilterBody {...props} />
    </Modal>
  );
}

function SaveFilterBody({ query, editing, onClose, onSaved }: Props) {
  const { reload, projectById } = useAppData();
  const toast = useToast();
  const [name, setName] = useState(editing?.name ?? '');
  const [busy, setBusy] = useState(false);
  const conditions = describeQuery(query, (id) => projectById(id)?.name);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const n = name.trim();
    if (!n) { toast('フィルタ名を入力してください。', true); return; }
    setBusy(true);
    try {
      let id: number;
      if (editing) {
        await api.updateFilter(editing.id, { name: n, query });
        id = editing.id;
      } else {
        id = (await api.addFilter(n, query)).id;
      }
      await reload();
      onSaved(id, query);
      toast(editing ? '保存フィルタを更新しました' : 'フィルタを保存しました');
    } catch (err) {
      toast((err as Error).message, true);
      setBusy(false);
    }
  };

  return (
    <form className="inner" onSubmit={(ev) => void submit(ev)}>
      <h2>フィルタを保存</h2>
      <label className="field">名前
        <input autoFocus value={name} placeholder="例: 未読の IPv6 論文" onChange={(ev) => setName(ev.target.value)} />
      </label>
      <div className="side-note" style={{ padding: '12px 0 0' }}>条件</div>
      <ul className="cond-list">
        {conditions.length ? conditions.map((c) => <li key={c}>{c}</li>) : <li>条件なし (すべての論文)</li>}
      </ul>
      <div className="dialog-actions">
        <button type="button" className="cancel" onClick={onClose}>キャンセル</button>
        <button type="submit" className="submit" disabled={busy}>{editing ? '更新' : '保存'}</button>
      </div>
    </form>
  );
}
