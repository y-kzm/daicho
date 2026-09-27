interface Props {
  tags: string[];
  selected: string[];
  onToggle: (t: string) => void;
  /** AI 提案ボタン (onSuggest を渡したときだけ表示) */
  busy?: boolean;
  onSuggest?: () => void;
}

export function TagPicker({ tags, selected, onToggle, busy = false, onSuggest }: Props) {
  return (
    <div className="full">
      <span className="field flabel" style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
        <span>タグ (クリックで選択)</span>
        {onSuggest && (
          <button type="button" className="linkbtn" disabled={busy} onClick={onSuggest}>{busy ? '提案中…' : 'AI 提案'}</button>
        )}
      </span>
      <div className="tagpick" id="tagPick">
        {tags.map((t) => (
          <span key={t} className={'tp' + (selected.includes(t) ? ' on' : '')} role="button" tabIndex={0}
            onClick={() => onToggle(t)}
            onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onToggle(t); } }}>
            {t}
          </span>
        ))}
      </div>
      {!tags.length && <div className="tagpick-empty">タグが未登録です。サイドバーの「タグ」の ＋ から追加してください。</div>}
    </div>
  );
}
