import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { FilterQuery, SavedFilter } from '../../shared/types';

/** App 全体で同時に 1 つだけ開くモーダル (契約 §7)。要約プロンプトは promptText で別に重ねる */
export type DialogState =
  | { kind: 'none' }
  | { kind: 'entry'; id: number | null }
  | { kind: 'bibtex'; ids: number[] }
  | { kind: 'merge' }
  | { kind: 'saveFilter'; query: FilterQuery; editing: SavedFilter | null }
  | { kind: 'confirm'; title: string; body: string; confirmLabel?: string; onConfirm: () => Promise<void> | void }
  | { kind: 'aiTags'; ids: number[] };

export interface DialogValue {
  dialog: DialogState;
  open: (d: DialogState) => void;
  close: () => void;
  promptText: string | null;
  showPrompt: (text: string) => void;
  closePrompt: () => void;
}

const Ctx = createContext<DialogValue | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [promptText, setPromptText] = useState<string | null>(null);
  const open = useCallback((d: DialogState) => setDialog(d), []);
  const close = useCallback(() => setDialog({ kind: 'none' }), []);
  const showPrompt = useCallback((text: string) => setPromptText(text), []);
  const closePrompt = useCallback(() => setPromptText(null), []);
  const value = useMemo<DialogValue>(
    () => ({ dialog, open, close, promptText, showPrompt, closePrompt }),
    [dialog, open, close, promptText, showPrompt, closePrompt],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDialogs(): DialogValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDialogs must be used inside DialogProvider');
  return v;
}
