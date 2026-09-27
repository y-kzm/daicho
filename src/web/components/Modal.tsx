import { useEffect, useRef, type ReactNode } from 'react';

interface Props { open: boolean; onClose: () => void; id?: string; children: ReactNode }

/** <dialog> の薄いラッパ。open の変化で showModal()/close() を呼ぶ。ESC で閉じたときは onClose を呼ぶ。 */
export function Modal({ open, onClose, id, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  // ネイティブ <dialog> の close イベントは d.close() 後に非同期（キューされたタスク）で発火する。
  // 親が dialog A を閉じて同時に dialog B を開いた場合（例: setDialog({kind:'bulkTags'})）、
  // A の close イベントは B が開いた後に届く。もし onClose を無条件に呼ぶと、A の
  // onClose（= setDialog({kind:'none'}) 相当）が B を即座に閉じてしまう。
  // openRef で「親がこの瞬間 open を true にしているか」を追跡し、close イベント発火時点で
  // open が false のまま（= ユーザー操作や親による意図的なクローズ）の場合のみ onClose を呼ぶ。
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} id={id} onClose={() => { if (openRef.current) onClose(); }}>
      {open && children}
    </dialog>
  );
}
