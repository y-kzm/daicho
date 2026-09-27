import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addTag, assertTagName, deleteTag, ensureTagStatements, entryTagStatements, listTags, renameTag, reorderTags,
} from '../../src/worker/db/tags';

async function tagsOfEntry(id: number): Promise<string[]> {
  const r = await env.DB.prepare(
    'SELECT t.name FROM entry_tags et JOIN tags t ON t.id = et.tag_id WHERE et.entry_id = ? ORDER BY et.position',
  ).bind(id).all<{ name: string }>();
  return r.results.map((x) => x.name);
}

describe('tags', () => {
  beforeEach(async () => {
    await env.DB.prepare("INSERT INTO entries (id, added, title) VALUES (1, '2026-01-01', 'A'), (2, '2026-01-01', 'B')").run();
  });

  it('assertTagName trims and rejects commas', () => {
    expect(assertTagName('  IPv6 ')).toBe('IPv6');
    expect(() => assertTagName('')).toThrow('タグ名を入力してください。');
    expect(() => assertTagName('a,b')).toThrow('タグ名にカンマは使えません。');
    expect(() => assertTagName('a、b')).toThrow('タグ名にカンマは使えません。');
  });

  it('addTag appends in order and rejects duplicates', async () => {
    await addTag(env.DB, 'B');
    await addTag(env.DB, 'A');
    expect(await listTags(env.DB)).toEqual(['B', 'A']);
    await expect(addTag(env.DB, 'A')).rejects.toThrow('同名のタグが既にあります: A');
  });

  it('ensureTagStatements + entryTagStatements attach tags to an entry', async () => {
    await env.DB.batch([...ensureTagStatements(env.DB, ['X', 'Y']), ...entryTagStatements(env.DB, 1, ['Y', 'X'])]);
    expect(await listTags(env.DB)).toEqual(['X', 'Y']);
    expect(await tagsOfEntry(1)).toEqual(['Y', 'X']);
    // 再設定で置き換わる
    await env.DB.batch([...ensureTagStatements(env.DB, ['Z']), ...entryTagStatements(env.DB, 1, ['Z'])]);
    expect(await tagsOfEntry(1)).toEqual(['Z']);
  });

  it('renameTag propagates to entries and rejects collisions', async () => {
    await env.DB.batch([...ensureTagStatements(env.DB, ['Old', 'Other']), ...entryTagStatements(env.DB, 1, ['Old'])]);
    await renameTag(env.DB, 'Old', 'New');
    expect(await tagsOfEntry(1)).toEqual(['New']);
    await expect(renameTag(env.DB, 'New', 'Other')).rejects.toMatchObject({ status: 409 });
    await expect(renameTag(env.DB, 'Nope', 'X')).rejects.toMatchObject({ status: 404 });
  });

  it('deleteTag removes it from entries', async () => {
    await env.DB.batch([...ensureTagStatements(env.DB, ['T']), ...entryTagStatements(env.DB, 1, ['T']), ...entryTagStatements(env.DB, 2, ['T'])]);
    await deleteTag(env.DB, 'T');
    expect(await listTags(env.DB)).toEqual([]);
    expect(await tagsOfEntry(1)).toEqual([]);
    expect(await tagsOfEntry(2)).toEqual([]);
  });

  it('reorderTags requires the same set', async () => {
    await env.DB.batch(ensureTagStatements(env.DB, ['A', 'B', 'C']));
    await reorderTags(env.DB, ['C', 'A', 'B']);
    expect(await listTags(env.DB)).toEqual(['C', 'A', 'B']);
    await expect(reorderTags(env.DB, ['C', 'A'])).rejects.toThrow('タグ一覧が変更されています。再読み込みしてやり直してください。');
  });
});
