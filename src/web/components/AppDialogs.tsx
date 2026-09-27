import { useRef } from 'react';
import { api } from '../api';
import { useRoute } from '../lib/router';
import { useAppData } from '../state/AppDataContext';
import { useDialogs } from '../state/DialogContext';
import { useLibrary } from '../state/LibraryContext';
import { useToast } from '../state/useToast';
import { ConfirmDialog } from './ConfirmDialog';
import { BibtexDialog } from './dialogs/BibtexDialog';
import { BulkTagDialog } from './dialogs/BulkTagDialog';
import { EntryDialog } from './dialogs/EntryDialog';
import { MergeDialog } from './dialogs/MergeDialog';
import { PromptDialog } from './dialogs/PromptDialog';
import { SaveFilterDialog } from './dialogs/SaveFilterDialog';

export function AppDialogs() {
  const { data, reload } = useAppData();
  const route = useRoute();
  const toast = useToast();
  const { dialog, close, promptText, showPrompt, closePrompt } = useDialogs();
  // await の後で「今のダイアログ」を見るため (レンダー時の dialog はクロージャに固定される)
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const { query, setDetailId, selectSource } = useLibrary();
  const entry = dialog.kind === 'entry' && dialog.id !== null ? data.entries.find((e) => e.id === dialog.id) ?? null : null;
  // プロジェクト画面ではライブラリの絞り込みタグを引き継がない
  const newTags = dialog.kind === 'entry' && dialog.id === null && route.name !== 'project' ? query.tags ?? [] : [];
  const onEntrySaved = async (id: number, isNew: boolean) => {
    close();
    if (!isNew) return;
    if (route.name !== 'project') { setDetailId(id); return; }
    // プロジェクト画面で追加したエントリは、そのプロジェクトの「気になる」列に入れる
    try {
      await api.setCite(id, route.id, '気になる');
    } catch (err) {
      toast((err as Error).message, true);
    }
    await reload();
  };
  return (
    <>
      <EntryDialog open={dialog.kind === 'entry'} entry={entry} initialTags={newTags}
        onClose={close} onShowPrompt={showPrompt}
        onSaved={(id, isNew) => void onEntrySaved(id, isNew)} />
      <BibtexDialog open={dialog.kind === 'bibtex'} ids={dialog.kind === 'bibtex' ? dialog.ids : []} onClose={close} />
      <BulkTagDialog open={dialog.kind === 'aiTags'} ids={dialog.kind === 'aiTags' ? dialog.ids : []} onClose={close} />
      <SaveFilterDialog open={dialog.kind === 'saveFilter'}
        query={dialog.kind === 'saveFilter' ? dialog.query : {}}
        editing={dialog.kind === 'saveFilter' ? dialog.editing : null}
        onClose={close}
        onSaved={(id, q) => { close(); selectSource({ kind: 'saved', id }, q); }} />
      <MergeDialog open={dialog.kind === 'merge'} onClose={close} />
      <ConfirmDialog open={dialog.kind === 'confirm'}
        title={dialog.kind === 'confirm' ? dialog.title : ''}
        body={dialog.kind === 'confirm' ? dialog.body : ''}
        confirmLabel={dialog.kind === 'confirm' ? dialog.confirmLabel : undefined}
        onConfirm={async () => {
          if (dialog.kind !== 'confirm') return;
          const mine = dialog;
          await mine.onConfirm();
          // 待っている間に別のダイアログへ切り替わっていたら、それは閉じない
          if (dialogRef.current === mine) close();
        }}
        onCancel={close} />
      <PromptDialog open={promptText !== null} text={promptText ?? ''} onClose={closePrompt} />
    </>
  );
}
