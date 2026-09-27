import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ATTACHMENT_KINDS, ATTACHMENTS_MAX, type Attachment, type AttachmentKind, type Entry } from '../../../shared/types';
import { api } from '../../api';
import { checkPdf, formatBytes, PDF_MIME, uploadPdf } from '../../lib/upload';
import { useAppData } from '../../state/AppDataContext';
import { useDialogs } from '../../state/DialogContext';
import { useDrive } from '../../state/DriveContext';
import { useToast } from '../../state/useToast';

interface Progress { name: string; ratio: number }

/** 詳細パネルの「PDF」。実体は自分の Google Drive に保存し、ここには URL を付ける */
export function DetailFiles({ e }: { e: Entry }) {
  const { applyData } = useAppData();
  const { status, refresh } = useDrive();
  const { open } = useDialogs();
  const toast = useToast();
  const [kind, setKind] = useState<AttachmentKind>(e.attachments.length ? '補足資料' : '本文');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  /** 送信中の印。state は次の描画まで変わらないので、続けて 2 回選ばれた場合に備えて ref でも持つ */
  const running = useRef(false);
  // 送信中にパネルを閉じたら中止する (送り終えても付け先の画面が無い)
  useEffect(() => () => abort.current?.abort(), []);

  const ready = status?.configured === true && status.connected;
  const full = e.attachments.length >= ATTACHMENTS_MAX;
  const busy = progress !== null;

  const upload = async (file: File) => {
    if (running.current || busy || !ready || full) return;
    running.current = true;
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const problem = checkPdf(file, head);
      if (problem) { toast(problem, true); return; }
      setProgress({ name: file.name, ratio: 0 });
      const session = await api.startUpload(e.id, kind, { size: file.size, type: PDF_MIME });
      // 送信先を作っている間に中止された場合は、送らない
      if (ctl.signal.aborted) return;
      setProgress({ name: session.name, ratio: 0 });
      const fileId = await uploadPdf(session.uploadUrl, file, (ratio) => setProgress({ name: session.name, ratio }), ctl.signal);
      applyData(await api.addAttachment(e.id, kind, fileId));
      toast(`「${session.name}」を保存しました`);
      setKind('補足資料');
    } catch (err) {
      if (!ctl.signal.aborted) toast((err as Error).message, true);
      void refresh(); // 接続が切れていた場合に、案内を出し直す
    } finally {
      running.current = false;
      abort.current = null;
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  const remove = (a: Attachment) => open({
    kind: 'confirm', title: 'PDF を削除',
    body: `「${a.name}」を論文から外し、Google Drive のゴミ箱へ移します。ゴミ箱からは 30 日以内なら戻せます。`,
    confirmLabel: '削除する',
    onConfirm: async () => { applyData(await api.deleteAttachment(a.id)); toast('PDF を削除しました'); },
  });

  const onDrop = (ev: DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    setOver(false);
    const file = ev.dataTransfer.files[0];
    if (file) void upload(file);
  };

  return (
    <section className="dp-sec">
      <h3>PDF</h3>
      {e.attachments.length > 0 && (
        <ul className="df-list">
          {e.attachments.map((a) => (
            <li key={a.id}>
              <a href={a.url} target="_blank" rel="noopener" title="Google Drive で開く">{a.name}</a>
              <span className="df-meta">{[a.kind, formatBytes(a.size)].filter(Boolean).join(' · ')}</span>
              <button type="button" className="sbtn danger" aria-label={`${a.name} を削除`} onClick={() => remove(a)}>削除</button>
            </li>
          ))}
        </ul>
      )}

      {status === null && <div className="df-note">Google Drive の状態を確認できません。ページを再読み込みしてください。</div>}
      {status && !status.configured && (
        <div className="df-note">PDF を保存するには、Google Drive の設定が必要です。手順は BUILD.md の「PDF を Google Drive に保存する」にあります。</div>
      )}
      {status?.configured && !status.connected && (
        <div className="df-connect">
          <div className="df-note">PDF は、あなたの Google Drive の「Daicho」フォルダに保存します。Daicho が扱えるのは、Daicho が保存したファイルだけです。</div>
          <a className="hbtn" href={api.driveConnectUrl}>Google Drive に接続</a>
        </div>
      )}

      {ready && !full && !busy && (
        <div className={'df-drop' + (over ? ' over' : '')}
          onDragOver={(ev) => { ev.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)} onDrop={onDrop}>
          <select aria-label="PDF の種類" value={kind} onChange={(ev) => setKind(ev.target.value as AttachmentKind)}>
            {ATTACHMENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <button type="button" className="sbtn" onClick={() => input.current?.click()}>PDF を選ぶ</button>
          <span className="df-hint">またはここへドロップ</span>
          <input ref={input} type="file" accept={PDF_MIME + ',.pdf'} hidden aria-label="PDF ファイル"
            onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void upload(f); }} />
        </div>
      )}
      {ready && full && <div className="df-note">1 つの論文に付けられる PDF は {ATTACHMENTS_MAX} 件までです。</div>}

      {progress && (
        <div className="df-progress" role="status" aria-live="polite">
          <div className="df-progress-name">{progress.name}</div>
          <div className="df-bar"><span style={{ width: `${Math.round(progress.ratio * 100)}%` }} /></div>
          <div className="df-progress-foot">
            <span>{Math.round(progress.ratio * 100)}% 送信中</span>
            <button type="button" className="linkbtn" onClick={() => abort.current?.abort()}>中止</button>
          </div>
        </div>
      )}
    </section>
  );
}
