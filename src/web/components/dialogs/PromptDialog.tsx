import { useRef } from 'react';
import { useToast } from '../../state/useToast';
import { Modal } from '../Modal';

interface Props { open: boolean; onClose: () => void; text: string }

export function PromptDialog({ open, onClose, text }: Props) {
  const toast = useToast();
  const ref = useRef<HTMLTextAreaElement>(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast('コピーしました'); }
    catch { ref.current?.select(); document.execCommand('copy'); toast('コピーしました'); }
  };
  return (
    <Modal open={open} onClose={onClose} id="promptDialog">
      <div className="inner">
        <h2>要約プロンプト</h2>
        <div className="side-note" style={{ padding: '0 0 6px' }}>お使いの LLM (Claude, ChatGPT 等) にそのまま貼り付けてください。</div>
        <textarea ref={ref} id="promptOut" className="mono" readOnly value={text}
          style={{ width: '100%', minHeight: 260, fontSize: 12, border: '1px solid var(--line)', borderRadius: 4, padding: 10, background: 'var(--paper)' }} />
        <div className="dialog-actions">
          <button type="button" className="cancel" onClick={onClose}>閉じる</button>
          <button type="button" className="submit" onClick={() => void copy()}>コピー</button>
        </div>
      </div>
    </Modal>
  );
}
