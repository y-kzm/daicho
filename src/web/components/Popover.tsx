import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  label: ReactNode;
  title?: string;
  className?: string;
  align?: 'left' | 'right';
  /** close を呼ぶとパネルを閉じる */
  children: (close: () => void) => ReactNode;
}

/** ボタン + 浮きパネル。外側クリックと Esc で閉じる (Esc は一覧のキー操作へ流さない) */
export function Popover({ label, title, className = 'sbtn', align = 'left', children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { ev.stopPropagation(); setOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <span className={'popover' + (open ? ' open' : '')} ref={ref}>
      <button type="button" className={className} title={title} aria-expanded={open}
        onClick={(ev) => { ev.stopPropagation(); setOpen((v) => !v); }}>
        {label}
      </button>
      {open && (
        <div className={'popover-panel ' + align} onClick={(ev) => ev.stopPropagation()}>
          {children(() => setOpen(false))}
        </div>
      )}
    </span>
  );
}
