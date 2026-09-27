import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useToast } from '../state/useToast';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

/** ページ内の確認ダイアログ (window.confirm の代わり) */
export function ConfirmDialog(props: Props) {
  // 実行中はキャンセル・Esc で閉じない (処理は止まらないので、閉じると結果が見えなくなる)
  const busyRef = useRef(false);
  const { onCancel } = props;
  return (
    <Modal open={props.open} onClose={() => { if (!busyRef.current) onCancel(); }} id="confirmDialog">
      <ConfirmBody {...props} busyRef={busyRef} />
    </Modal>
  );
}

function ConfirmBody({ title, body, confirmLabel = '削除する', onConfirm, onCancel, busyRef }: Props & { busyRef: MutableRefObject<boolean> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = innerRef.current?.closest('dialog');
    if (!d) return;
    const onEsc = (ev: Event) => { if (busyRef.current) ev.preventDefault(); };
    d.addEventListener('cancel', onEsc);
    return () => { d.removeEventListener('cancel', onEsc); busyRef.current = false; };
  }, [busyRef]);

  const run = async () => {
    setBusy(true);
    busyRef.current = true;
    try {
      await onConfirm();
    } catch (err) {
      toast((err as Error).message, true);
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="inner" ref={innerRef}>
      <h2>{title}</h2>
      <p className="confirm-body">{body}</p>
      <div className="dialog-actions">
        <button type="button" className="cancel" disabled={busy} onClick={onCancel}>キャンセル</button>
        <button type="button" className="submit danger" disabled={busy} onClick={() => void run()}>{confirmLabel}</button>
      </div>
    </div>
  );
}
