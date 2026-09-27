import { useState } from 'react';

interface Props { initial: string; placeholder?: string; onSubmit: (v: string) => void; onCancel: () => void }

/** サイドバーの追加・改名用 1 行入力 */
export function InlineName({ initial, placeholder, onSubmit, onCancel }: Props) {
  const [v, setV] = useState(initial);
  return (
    <input className="side-input" autoFocus value={v} placeholder={placeholder} aria-label={placeholder ?? '名前'}
      onChange={(ev) => setV(ev.target.value)}
      onKeyDown={(ev) => {
        // IME 変換確定の Enter で送信しない
        if (ev.nativeEvent.isComposing || ev.keyCode === 229) return;
        if (ev.key === 'Enter') {
          ev.preventDefault();
          const t = v.trim();
          if (t) onSubmit(t);
          else onCancel();
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          onCancel();
        }
      }}
      onBlur={onCancel} />
  );
}
