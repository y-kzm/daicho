import { describe, expect, it } from 'vitest';
import {
  isEditableTarget, isPaletteShortcut, listKeyAction, moveFocus, rangeBetween, type KeyLike,
} from '../../src/web/lib/keys';

const k = (key: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });
const target = (o: object) => o as unknown as EventTarget;

describe('isEditableTarget', () => {
  it('text inputs, textarea, select and contentEditable are editable', () => {
    expect(isEditableTarget(target({ tagName: 'INPUT', type: 'text' }))).toBe(true);
    expect(isEditableTarget(target({ tagName: 'INPUT', type: 'search' }))).toBe(true);
    expect(isEditableTarget(target({ tagName: 'TEXTAREA' }))).toBe(true);
    expect(isEditableTarget(target({ tagName: 'SELECT' }))).toBe(true);
    expect(isEditableTarget(target({ tagName: 'DIV', isContentEditable: true }))).toBe(true);
  });
  it('checkboxes, buttons, rows and null are not', () => {
    expect(isEditableTarget(target({ tagName: 'INPUT', type: 'checkbox' }))).toBe(false);
    expect(isEditableTarget(target({ tagName: 'BUTTON' }))).toBe(false);
    expect(isEditableTarget(target({ tagName: 'TR' }))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('key mapping', () => {
  it('palette shortcut is Cmd-K or Ctrl-K', () => {
    expect(isPaletteShortcut(k('k', { metaKey: true }))).toBe(true);
    expect(isPaletteShortcut(k('K', { ctrlKey: true }))).toBe(true);
    expect(isPaletteShortcut(k('k'))).toBe(false);
    expect(isPaletteShortcut(k('k', { metaKey: true, altKey: true }))).toBe(false);
  });
  it('list actions', () => {
    expect(listKeyAction(k('ArrowDown'))).toEqual({ type: 'move', delta: 1 });
    expect(listKeyAction(k('ArrowUp'))).toEqual({ type: 'move', delta: -1 });
    expect(listKeyAction(k(' '))).toEqual({ type: 'toggle' });
    expect(listKeyAction(k('Enter'))).toEqual({ type: 'open' });
    expect(listKeyAction(k('Escape'))).toEqual({ type: 'escape' });
    expect(listKeyAction(k('s'))).toEqual({ type: 'star' });
    expect(listKeyAction(k('3'))).toEqual({ type: 'priority', value: 3 });
    expect(listKeyAction(k('0'))).toEqual({ type: 'priority', value: 0 });
    expect(listKeyAction(k('4'))).toBeNull();
    expect(listKeyAction(k('s', { metaKey: true }))).toBeNull();
  });
});

describe('focus and range', () => {
  const ordered = [5, 3, 9, 1];
  it('moveFocus starts from the edges and clamps', () => {
    expect(moveFocus(ordered, null, 1)).toBe(5);
    expect(moveFocus(ordered, null, -1)).toBe(1);
    expect(moveFocus(ordered, 3, 1)).toBe(9);
    expect(moveFocus(ordered, 1, 1)).toBe(1);
    expect(moveFocus(ordered, 5, -1)).toBe(5);
    expect(moveFocus(ordered, 42, 1)).toBe(5);
    expect(moveFocus([], null, 1)).toBeNull();
  });
  it('rangeBetween works in both directions', () => {
    expect(rangeBetween(ordered, 3, 1)).toEqual([3, 9, 1]);
    expect(rangeBetween(ordered, 1, 3)).toEqual([3, 9, 1]);
    expect(rangeBetween(ordered, null, 9)).toEqual([9]);
    expect(rangeBetween(ordered, 3, 42)).toEqual([]);
  });
});
