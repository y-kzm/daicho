import type { LlmProvider } from '../../../shared/types';

interface Props {
  provider: LlmProvider;
  onProvider: (p: LlmProvider) => void;
  busyPrompt: boolean;
  busySummary: boolean;
  onCopyPrompt: () => void;
  onGenerate: () => void;
}

export function ProviderSelect({ value, onChange, id }: { value: LlmProvider; onChange: (p: LlmProvider) => void; id?: string }) {
  return (
    <select id={id} value={value} onChange={(ev) => onChange(ev.target.value as LlmProvider)}>
      <option value="gemini">Gemini (無料)</option>
      <option value="claude">Claude Haiku</option>
    </select>
  );
}

export function EntryDialogTools({ provider, onProvider, busyPrompt, busySummary, onCopyPrompt, onGenerate }: Props) {
  return (
    <span className="sumtools">
      <button type="button" className="linkbtn" disabled={busyPrompt} onClick={onCopyPrompt}>
        {busyPrompt ? '準備中…' : 'プロンプトをコピー'}
      </button>
      <ProviderSelect id="sumProvider" value={provider} onChange={onProvider} />
      <button type="button" className="genbtn" disabled={busySummary} onClick={onGenerate}>
        {busySummary ? '生成中…' : '自動生成'}
      </button>
    </span>
  );
}
