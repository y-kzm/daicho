export interface SummaryBlock { q: string; a: string }

/**
 * 「〜？: 回答」形式の行を質問ラベル + 回答に分ける。
 * 1 行も整形できなかった (または空) 場合は null を返し、呼び出し側は素のテキストで表示する。
 */
export function parseSummary(text: string): SummaryBlock[] | null {
  const normalized = String(text || '').replace(/([。\.\)）])\s+(?=[^\n]{0,40}[？?]\s*[:：])/g, '$1\n');
  const lines = normalized.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  let matchedAny = false;
  const blocks = lines.map((line) => {
    const m = line.match(/^[-・\s]*(.{1,40}[？?])\s*[:：]\s*(.*)$/);
    if (m) { matchedAny = true; return { q: m[1]!, a: m[2] || '' }; }
    return { q: '', a: line };
  });
  if (!matchedAny && lines.length === 1) return null;
  return blocks;
}
