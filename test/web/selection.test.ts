import { describe, expect, it } from 'vitest';
import { rowAction } from '../../src/web/lib/selection';

const plain = { shiftKey: false, metaKey: false, ctrlKey: false };

describe('rowAction', () => {
  it('only opens the detail on a plain click outside selection mode', () => {
    expect(rowAction(false, plain)).toBe('open');
  });
  it('toggles on a plain click in selection mode', () => {
    expect(rowAction(true, plain)).toBe('toggle');
  });
  it('treats modifier clicks as selection in both modes', () => {
    for (const mode of [false, true]) {
      expect(rowAction(mode, { ...plain, shiftKey: true })).toBe('range');
      expect(rowAction(mode, { ...plain, metaKey: true })).toBe('toggle');
      expect(rowAction(mode, { ...plain, ctrlKey: true })).toBe('toggle');
      expect(rowAction(mode, { shiftKey: true, metaKey: true, ctrlKey: false })).toBe('range');
    }
  });
});
