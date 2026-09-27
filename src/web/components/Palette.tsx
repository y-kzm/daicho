import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { paletteItemKey, searchPalette, type PaletteItem } from '../lib/palette';
import { navigate } from '../lib/router';
import { useAppData } from '../state/AppDataContext';
import { useLibrary } from '../state/LibraryContext';
import { Modal } from './Modal';

export const PALETTE_COMMANDS: PaletteItem[] = [
  { kind: 'command', id: 'add', label: '論文を追加' },
  { kind: 'command', id: 'bibtex', label: 'BibTeX 出力 (現在の一覧)' },
  { kind: 'command', id: 'duplicates', label: '重複チェック' },
  { kind: 'command', id: 'aiTags', label: 'AI タグ提案' },
  { kind: 'command', id: 'stats', label: '統計を開く' },
  { kind: 'command', id: 'library', label: 'ライブラリを開く' },
];

const KIND_LABEL: Record<PaletteItem['kind'], string> = { entry: '論文', project: 'プロジェクト', tag: 'タグ', command: 'コマンド' };

function mainText(it: PaletteItem): string {
  switch (it.kind) {
    case 'entry': return it.title;
    case 'project': return it.name;
    case 'tag': return '# ' + it.name;
    default: return it.label;
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCommand: (id: string) => void;
  onPickEntry: (id: number) => void;
}

export function Palette(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} id="palette">
      <PaletteBody {...props} />
    </Modal>
  );
}

function PaletteBody({ onClose, onCommand, onPickEntry }: Props) {
  const { data } = useAppData();
  const { selectSource } = useLibrary();
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const items = useMemo(() => searchPalette(q, data, PALETTE_COMMANDS), [q, data]);

  useEffect(() => setCursor(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('.pal-item.on')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const pick = (it: PaletteItem) => {
    onClose();
    switch (it.kind) {
      case 'entry': onPickEntry(it.id); break;
      case 'project': navigate({ name: 'project', id: it.id }); break;
      case 'tag': selectSource({ kind: 'tag', name: it.name }); navigate({ name: 'library' }); break;
      default: onCommand(it.id);
    }
  };
  const onKey = (ev: KeyboardEvent<HTMLInputElement>) => {
    // IME 変換中の Enter / 矢印は変換操作なので拾わない
    if (ev.nativeEvent.isComposing || ev.keyCode === 229) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setCursor((c) => Math.min(items.length - 1, c + 1)); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (ev.key === 'Enter') {
      ev.preventDefault();
      const it = items[cursor];
      if (it) pick(it);
    }
  };

  return (
    <div className="palette">
      <input className="pal-input" autoFocus aria-label="パレット検索" placeholder="タイトル・bibkey・タグ・プロジェクト・コマンドを検索"
        value={q} onChange={(ev) => setQ(ev.target.value)} onKeyDown={onKey} />
      <ul className="pal-list" ref={listRef} role="listbox">
        {!items.length && <li className="pal-empty">一致するものはありません</li>}
        {items.map((it, i) => (
          <li key={paletteItemKey(it)} role="option" aria-selected={i === cursor} className={'pal-item' + (i === cursor ? ' on' : '')}
            onMouseEnter={() => setCursor(i)} onMouseDown={(ev) => { ev.preventDefault(); pick(it); }}>
            <span className="pal-kind">{KIND_LABEL[it.kind]}</span>
            <span className="pal-main">{mainText(it)}</span>
            {it.kind === 'entry' && it.sub && <span className="pal-sub">{it.sub}</span>}
          </li>
        ))}
      </ul>
      <div className="pal-hint">↑↓ で移動 · Enter で開く · Esc で閉じる</div>
    </div>
  );
}
