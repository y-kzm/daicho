import { describe, expect, it } from 'vitest';
import { parseSummary } from '../../src/web/lib/summary';

describe('parseSummary', () => {
  it('splits Q&A lines', () => {
    expect(parseSummary('提案手法はどのようなものか？: X\n先行研究と比べてすごいことは？: Y')).toEqual([
      { q: '提案手法はどのようなものか？', a: 'X' },
      { q: '先行研究と比べてすごいことは？', a: 'Y' },
    ]);
  });
  it('splits a single line with joined questions and tolerates half-width ?', () => {
    expect(parseSummary('手法は? : A。 先行研究比は?: B')).toEqual([{ q: '手法は?', a: 'A。' }, { q: '先行研究比は?', a: 'B' }]);
  });
  it('returns null for plain text', () => {
    expect(parseSummary('ただの文章です。')).toBeNull();
    expect(parseSummary('')).toBeNull();
  });
  it('keeps non-matching lines as plain blocks when at least one matched', () => {
    expect(parseSummary('前置き\n手法は？: A')).toEqual([{ q: '', a: '前置き' }, { q: '手法は？', a: 'A' }]);
  });
});
