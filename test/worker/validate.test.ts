import { describe, expect, it } from 'vitest';
import {
  assertBulkSize, optBool, optPriority, parseBulkOp, parseCiteState, parseEntryInput, parseIdParam, parsePriority,
  parseReadState, positiveInt,
} from '../../src/worker/validate';

describe('parseEntryInput', () => {
  it('normalizes strings and tags', () => {
    const e = parseEntryInput({ title: ' T ', year: 2024, tags: [' a ', '', 'b'], read: 'bogus', note: null });
    expect(e).toMatchObject({ title: 'T', year: '2024', tags: ['a', 'b'], read: '未読', note: '', doi: '' });
  });
  it('requires title', () => {
    expect(() => parseEntryInput({ title: '  ' })).toThrow('タイトルは必須です。');
    expect(() => parseEntryInput(null)).toThrow('タイトルは必須です。');
  });
  it('keeps valid read states', () => {
    expect(parseEntryInput({ title: 'x', read: '精読済' }).read).toBe('精読済');
  });
  it('splits tag names containing commas or 読点', () => {
    expect(parseEntryInput({ title: 'x', tags: ['a, b', 'c、a'] }).tags).toEqual(['a', 'b', 'c']);
  });
});

describe('parseIdParam', () => {
  it('accepts positive integers only', () => {
    expect(parseIdParam('12')).toBe(12);
    for (const bad of ['0', '-1', 'abc', '1.5', '']) expect(() => parseIdParam(bad)).toThrow();
  });
});

describe('state and flag parsers', () => {
  it('parseReadState / parseCiteState', () => {
    expect(parseReadState('精読済')).toBe('精読済');
    expect(() => parseReadState('x')).toThrow('読了状態が不正です。');
    expect(parseCiteState(' 引用する ')).toBe('引用する');
    expect(() => parseCiteState('')).toThrow('引用状態が不正です。');
  });
  it('optBool accepts only booleans or undefined', () => {
    expect(optBool(undefined)).toBeUndefined();
    expect(optBool(true)).toBe(true);
    expect(optBool(false)).toBe(false);
    for (const bad of [1, 'true', null]) expect(() => optBool(bad)).toThrow('リクエスト本文が不正です。');
  });
  it('parsePriority / optPriority accept 0-3 numbers only', () => {
    expect(parsePriority(0)).toBe(0);
    expect(parsePriority(3)).toBe(3);
    for (const bad of [4, -1, 1.5, '2', null]) expect(() => parsePriority(bad)).toThrow('優先度が不正です。');
    expect(optPriority(undefined)).toBeUndefined();
    expect(optPriority(2)).toBe(2);
  });
  it('positiveInt reads numbers and digit strings', () => {
    expect(positiveInt(3)).toBe(3);
    expect(positiveInt('12')).toBe(12);
    for (const bad of [0, -1, 1.5, 'x', '', null, undefined]) expect(() => positiveInt(bad)).toThrow('不正な ID です。');
  });
});

describe('bulk parsers', () => {
  it('assertBulkSize allows up to 200', () => {
    expect(() => assertBulkSize(200)).not.toThrow();
    expect(() => assertBulkSize(201)).toThrow('一度に扱えるのは 200 件までです。');
  });
  it('parseBulkOp normalizes each op type', () => {
    expect(parseBulkOp({ type: 'tags', add: ['a, b'], remove: 'c' })).toEqual({ type: 'tags', add: ['a', 'b'], remove: ['c'] });
    expect(parseBulkOp({ type: 'read', state: '精読済' })).toEqual({ type: 'read', state: '精読済' });
    expect(parseBulkOp({ type: 'flags', priority: 2 })).toEqual({ type: 'flags', starred: undefined, priority: 2 });
    expect(parseBulkOp({ type: 'project', projectId: '3', state: '引用候補' })).toEqual({ type: 'project', projectId: 3, state: '引用候補' });
    expect(parseBulkOp({ type: 'delete' })).toEqual({ type: 'delete' });
    expect(() => parseBulkOp({ type: 'x' })).toThrow('一括操作の種類が不正です。');
    expect(() => parseBulkOp('delete')).toThrow('一括操作の種類が不正です。');
  });
});
