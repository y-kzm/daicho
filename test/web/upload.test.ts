import { describe, expect, it } from 'vitest';
import { checkPdf, formatBytes, looksLikePdf } from '../../src/web/lib/upload';

const bytes = (s: string) => new TextEncoder().encode(s);
const PDF_HEAD = bytes('%PDF-1.7\n');

describe('looksLikePdf', () => {
  it('accepts the PDF signature only at the very start', () => {
    expect(looksLikePdf(PDF_HEAD)).toBe(true);
    expect(looksLikePdf(bytes('%PDF-'))).toBe(true);
    expect(looksLikePdf(bytes(' %PDF-1.7'))).toBe(false);
    expect(looksLikePdf(bytes('%PDF'))).toBe(false);
    expect(looksLikePdf(bytes('<html>'))).toBe(false);
    expect(looksLikePdf(new Uint8Array())).toBe(false);
  });
});

describe('checkPdf', () => {
  const ok = { name: 'paper.pdf', size: 1000, type: 'application/pdf' };
  it('accepts a PDF, also when the browser reports no type', () => {
    expect(checkPdf(ok, PDF_HEAD)).toBeNull();
    expect(checkPdf({ ...ok, type: '' }, PDF_HEAD)).toBeNull();
    expect(checkPdf({ ...ok, type: '', name: 'PAPER.PDF' }, PDF_HEAD)).toBeNull();
  });
  it('rejects other types, renamed files and files without the signature', () => {
    expect(checkPdf({ ...ok, type: 'image/png' }, PDF_HEAD)).toBe('PDF ファイルを選んでください。');
    expect(checkPdf({ ...ok, type: '', name: 'paper.txt' }, PDF_HEAD)).toBe('PDF ファイルを選んでください。');
    expect(checkPdf(ok, bytes('PK\u0003\u0004zip'))).toBe('PDF ファイルを選んでください。');
  });
  it('rejects empty and oversized files, at the exact limit', () => {
    expect(checkPdf({ ...ok, size: 0 }, PDF_HEAD)).toBe('空のファイルです。');
    expect(checkPdf({ ...ok, size: 100 * 1024 * 1024 }, PDF_HEAD)).toBeNull();
    expect(checkPdf({ ...ok, size: 100 * 1024 * 1024 + 1 }, PDF_HEAD)).toContain('100 MB まで');
  });
});

describe('formatBytes', () => {
  it('uses the largest fitting unit', () => {
    expect(formatBytes(0)).toBe('');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
  });
});
