import { useEffect, useRef } from 'react';
import { isEditableTarget, listKeyAction, moveFocus } from '../../lib/keys';
import { useAppData } from '../../state/AppDataContext';
import { useSelection } from '../../state/SelectionContext';
import { useEntryActions } from './useEntryActions';

interface Options {
  /** 画面に見えている行の id (表示順) */
  ordered: number[];
  detailOpen: boolean;
  onOpen: (id: number) => void;
  onCloseDetail: () => void;
}

const INTERACTIVE = 'a,button,summary,input,textarea,select,[role=button],[contenteditable]';

function isInteractiveTarget(t: EventTarget | null): boolean {
  return t instanceof Element && t.closest(INTERACTIVE) !== null;
}

function scrollToEntry(id: number): void {
  document.querySelector(`[data-entry-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
}

export function useListKeys(opts: Options): void {
  const sel = useSelection();
  const { data } = useAppData();
  const actions = useEntryActions();
  const latest = useRef({ opts, sel, data, actions });
  latest.current = { opts, sel, data, actions };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || isEditableTarget(ev.target)) return;
      if (document.querySelector('dialog[open]') || document.querySelector('.popover-panel')) return;
      const act = listKeyAction(ev);
      if (!act) return;
      // リンク・ボタン・summary など自身の Space/Enter を持つ要素ではそちらを優先
      if ((act.type === 'toggle' || act.type === 'open') && isInteractiveTarget(ev.target)) return;
      const { opts: o, sel: s, data: d, actions: a } = latest.current;
      const focus = s.focusId;
      const entry = focus === null ? undefined : d.entries.find((e) => e.id === focus);
      switch (act.type) {
        case 'move': {
          const next = moveFocus(o.ordered, focus, act.delta);
          if (next === null) return;
          ev.preventDefault();
          s.setFocus(next);
          if (o.detailOpen) o.onOpen(next);
          scrollToEntry(next);
          return;
        }
        case 'toggle':
          if (focus === null) return;
          ev.preventDefault();
          s.toggle(focus);
          return;
        case 'open':
          if (focus === null) return;
          ev.preventDefault();
          o.onOpen(focus);
          return;
        case 'escape':
          if (o.detailOpen) o.onCloseDetail();
          else s.clear();
          return;
        case 'star':
          if (entry) a.toggleStar(entry);
          return;
        case 'priority':
          if (entry) a.setPriority(entry, act.value);
          return;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
