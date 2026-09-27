import { describe, expect, it } from 'vitest';
import { attachmentName, cleanPart, truncateTitle } from '../../src/worker/services/filename';

describe('attachmentName', () => {
  const e = { bibkey: 'vaswani2017attention', title: 'Attention Is All You Need' };

  it('joins the BibTeX key and the title', () => {
    expect(attachmentName(e, '本文')).toBe('vaswani2017attention - Attention Is All You Need.pdf');
  });

  it('marks everything except the main text with its kind', () => {
    expect(attachmentName(e, '補足資料')).toBe('vaswani2017attention - Attention Is All You Need (補足資料).pdf');
    expect(attachmentName(e, 'スライド')).toBe('vaswani2017attention - Attention Is All You Need (スライド).pdf');
  });

  it('numbers a name that is already taken, ignoring case', () => {
    const first = attachmentName(e, '本文');
    expect(attachmentName(e, '本文', [first])).toBe('vaswani2017attention - Attention Is All You Need (2).pdf');
    expect(attachmentName(e, '本文', [first.toUpperCase(), 'vaswani2017attention - Attention Is All You Need (2).pdf']))
      .toBe('vaswani2017attention - Attention Is All You Need (3).pdf');
  });

  it('removes characters that are unsafe in file names', () => {
    expect(attachmentName({ bibkey: 'a/b:c', title: 'What? "Why": <x>|y* \\ z' }, '本文')).toBe('a b c - What Why x y z.pdf');
    expect(attachmentName({ bibkey: 'k', title: 'line\nbreak\tand\u0000null' }, '本文')).toBe('k - line break and null.pdf');
  });

  it('falls back when the key or the title is empty', () => {
    expect(attachmentName({ bibkey: '', title: 'Only Title' }, '本文')).toBe('Only Title.pdf');
    expect(attachmentName({ bibkey: 'key', title: '   ' }, '本文')).toBe('key.pdf');
    expect(attachmentName({ bibkey: '', title: '///' }, '本文')).toBe('untitled.pdf');
  });

  it('keeps Japanese titles and cuts long ones', () => {
    expect(attachmentName({ bibkey: 'yamada2024', title: '近隣探索プロトコルの測定' }, '本文')).toBe('yamada2024 - 近隣探索プロトコルの測定.pdf');
    const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    const name = attachmentName({ bibkey: 'k', title: long }, '本文');
    expect(name.endsWith('.pdf')).toBe(true);
    expect(Array.from(name).length).toBeLessThanOrEqual('k - '.length + 80 + '.pdf'.length);
    expect(name).not.toMatch(/ \.pdf$/);
  });
});

describe('attachmentName with hostile metadata', () => {
  it('drops invisible and direction-changing characters', () => {
    const title = 'Safe\u202Efdp.exe\u202C \u200Btitle\u200D\uFEFF\u00AD\u2066x\u2069';
    const name = attachmentName({ bibkey: 'k\u200F', title }, '本文');
    expect(name).toBe('k - Safefdp.exe titlex.pdf');
    expect(name).not.toMatch(/[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff\u0080-\u009f]/);
  });
  it('replaces C1 control characters', () => {
    expect(attachmentName({ bibkey: 'k', title: 'a\u0085b\u009fc' }, '本文')).toBe('k - a b c.pdf');
  });
  it('caps a long BibTeX key', () => {
    const name = attachmentName({ bibkey: 'x'.repeat(300), title: 'T' }, '本文');
    expect(name).toBe('x'.repeat(60) + ' - T.pdf');
  });
});

describe('cleanPart / truncateTitle', () => {
  it('trims dots and spaces at both ends', () => {
    expect(cleanPart('  ..hidden. ')).toBe('hidden');
    expect(cleanPart('a   b')).toBe('a b');
  });
  it('cuts at a word boundary, or by length when there is none', () => {
    expect(truncateTitle('aaaa bbbb cccc', 10)).toBe('aaaa bbbb');
    expect(truncateTitle('abcdefghijklmnop', 10)).toBe('abcdefghij');
    expect(truncateTitle('short', 10)).toBe('short');
  });
  it('does not split a surrogate pair', () => {
    const t = truncateTitle('😀'.repeat(12), 10);
    expect(Array.from(t)).toHaveLength(10);
  });
});
