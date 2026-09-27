import { useMemo, useRef } from 'react';
import type { EntryProjectInput } from '../../shared/types';
import { useRoute } from '../lib/router';
import { useAppData } from '../state/AppDataContext';
import { useDialogs } from '../state/DialogContext';
import { useLibrary } from '../state/LibraryContext';
import { useScope } from '../state/ScopeContext';
import { ConfirmDialog } from './ConfirmDialog';
import { BibtexDialog } from './dialogs/BibtexDialog';
import { BulkTagDialog } from './dialogs/BulkTagDialog';
import { EntryDialog } from './dialogs/EntryDialog';
import { MergeDialog } from './dialogs/MergeDialog';
import { PromptDialog } from './dialogs/PromptDialog';
import { SaveFilterDialog } from './dialogs/SaveFilterDialog';

export function AppDialogs() {
  const { data } = useAppData();
  const { scope } = useScope();
  const route = useRoute();
  const { dialog, close, promptText, showPrompt, closePrompt } = useDialogs();
  // await の後で「今のダイアログ」を見るため (レンダー時の dialog はクロージャに固定される)
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const { query, setDetailId, selectSource } = useLibrary();
  const entry = dialog.kind === 'entry' && dialog.id !== null ? data.entries.find((e) => e.id === dialog.id) ?? null : null;
  // プロジェクト画面ではライブラリの絞り込みタグを引き継がない
  const newTags = dialog.kind === 'entry' && dialog.id === null && route.name !== 'project' ? query.tags ?? [] : [];
  // 開いているプロジェクトは、追加ダイアログで最初から選択済みにする (登録と同じ要求で入る)
  const newProjects = useMemo<EntryProjectInput[]>(
    () => (scope === null ? [] : [{ projectId: scope, state: '気になる' }]),
    [scope],
  );
  const onEntrySaved = (id: number, isNew: boolean) => {
    close();
    // カンバンには詳細パネルの開閉状態が別にあるので、一覧のときだけ詳細を開く
    if (isNew && route.name !== 'project') setDetailId(id);
  };
  return (
    <>
      <EntryDialog open={dialog.kind === 'entry'} entry={entry} initialTags={newTags} initialProjects={newProjects}
        onClose={close} onShowPrompt={showPrompt} onSaved={onEntrySaved} />
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
