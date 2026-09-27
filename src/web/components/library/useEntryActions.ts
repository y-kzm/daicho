import { useMemo } from 'react';
import type { Entry, Priority, ReadState } from '../../../shared/types';
import { api } from '../../api';
import { useAppData } from '../../state/AppDataContext';
import { useToast } from '../../state/useToast';

export interface EntryActions {
  toggleStar(e: Entry): void;
  setPriority(e: Entry, p: Priority): void;
  setRead(e: Entry, r: ReadState): void;
}

/** ★・優先度・読了の即時更新 (先に画面を変え、失敗したら再読み込みで戻す) */
export function useEntryActions(): EntryActions {
  const { patchEntry, reload } = useAppData();
  const toast = useToast();
  return useMemo<EntryActions>(() => {
    const fail = (err: unknown) => {
      toast((err as Error).message, true);
      void reload();
    };
    return {
      toggleStar: (e) => {
        const starred = !e.starred;
        patchEntry(e.id, { starred });
        api.setFlags(e.id, { starred }).catch(fail);
      },
      setPriority: (e, priority) => {
        if (e.priority === priority) return;
        patchEntry(e.id, { priority });
        api.setFlags(e.id, { priority }).catch(fail);
      },
      setRead: (e, read) => {
        patchEntry(e.id, { read });
        api.setRead(e.id, read).catch(fail);
      },
    };
  }, [patchEntry, reload, toast]);
}
