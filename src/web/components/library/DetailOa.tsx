import { useState } from 'react';
import { isOpenAccess, OA_LABELS, OA_STATUSES, type Entry, type OaStatus } from '../../../shared/types';
import { api } from '../../api';
import { useAppData } from '../../state/AppDataContext';
import { useToast } from '../../state/useToast';
import { OaBadge } from '../OaBadge';

const isWebUrl = (u: string): boolean => /^https?:\/\//i.test(u);

/** 詳細パネルの「Open Access」。論文だけに出す */
export function DetailOa({ e }: { e: Entry }) {
  const { patchEntry } = useAppData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<OaStatus>(e.oa.status);
  const [url, setUrl] = useState(e.oa.url);
  if (e.kind !== 'paper') return null;
  const oa = e.oa;

  const check = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.checkOa(e.id);
      patchEntry(e.id, { oa: r.oa });
      toast(isOpenAccess(r.oa.status) ? 'Open Access でした' : OA_LABELS[r.oa.status]);
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const saveManual = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.setOa(e.id, status, url.trim());
      patchEntry(e.id, { oa: r.oa });
      setEditing(false);
      toast('保存しました');
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="dp-sec">
      <h3>Open Access</h3>
      {!editing ? (
        <>
          <div className="dp-oa-line">
            <OaBadge e={e} />
            <span className={oa.status ? '' : 'dp-oa-none'}>{OA_LABELS[oa.status]}</span>
          </div>
          {(isWebUrl(oa.url) || oa.license || oa.checkedAt) && (
            <dl className="dp-meta">
              {isWebUrl(oa.url) && <div><dt>読める場所</dt><dd><a href={oa.url} target="_blank" rel="noopener">開く ↗</a></dd></div>}
              {oa.license && <div><dt>ライセンス</dt><dd className="mono">{oa.license}</dd></div>}
              {oa.checkedAt && <div><dt>判定した日</dt><dd className="mono">{oa.checkedAt}</dd></div>}
            </dl>
          )}
          {oa.status === 'green' && <div className="df-note">出版された版とは内容が違うことがあります。</div>}
          <div className="dp-oa-actions">
            {e.doi
              ? <button type="button" className="sbtn" disabled={busy} onClick={() => void check()}>{busy ? '判定中…' : oa.checkedAt ? '判定し直す' : '判定する'}</button>
              : <span className="df-note">DOI が無いので、自動では判定できません。</span>}
            <button type="button" className="sbtn" onClick={() => { setStatus(oa.status); setUrl(oa.url); setEditing(true); }}>手で設定</button>
          </div>
        </>
      ) : (
        <div className="dp-oa-edit">
          <select aria-label="Open Access の種類" value={status} onChange={(ev) => setStatus(ev.target.value as OaStatus)}>
            <option value="">未判定</option>
            {OA_STATUSES.filter((s) => s !== 'unknown').map((s) => <option key={s} value={s}>{OA_LABELS[s]}</option>)}
          </select>
          {status && status !== 'closed' && (
            <input type="url" aria-label="読める場所の URL" placeholder="読める場所の URL (任意)" value={url} onChange={(ev) => setUrl(ev.target.value)} />
          )}
          <div className="dp-oa-actions">
            <button type="button" className="sbtn" onClick={() => setEditing(false)}>キャンセル</button>
            <button type="button" className="sbtn" disabled={busy} onClick={() => void saveManual()}>保存</button>
          </div>
        </div>
      )}
    </section>
  );
}
