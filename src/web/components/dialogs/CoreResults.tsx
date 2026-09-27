import type { CoreResult } from '../../../shared/types';

export function CoreResults({ result, onPick }: { result: CoreResult | null; onPick: (rank: string) => void }) {
  if (!result) return <div id="coreResults" />;
  if (!result.candidates.length) {
    return (
      <div id="coreResults" className="show">
        「{result.query}」で自動取得できませんでした。
        <a href={result.searchUrl} target="_blank" rel="noopener">CORE で直接検索する ↗</a>
      </div>
    );
  }
  return (
    <div id="coreResults" className="show">
      <div>「{result.query}」の検索結果 — 候補をクリックするとランクが入力されます:</div>
      {result.candidates.map((c, i) => (
        <div className="cand" key={i} onClick={() => onPick(c.rank)}>
          <span className="rk mono">{c.rank}</span>
          <span>{(c.acronym ? c.acronym + ' — ' : '') + c.title + (c.source ? ' (' + c.source + ')' : '')}</span>
        </div>
      ))}
      <div className="cand cand-na" onClick={() => onPick('N/A')}>
        <span className="rk mono">N/A</span>
        <span>どれにも該当しない (CORE 未収録として N/A を入力)</span>
      </div>
      <div style={{ marginTop: 5 }}>
        <a href={result.searchUrl} target="_blank" rel="noopener">CORE で直接検索して確認する ↗</a>
      </div>
    </div>
  );
}
