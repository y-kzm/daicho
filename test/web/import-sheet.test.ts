import { describe, expect, it } from 'vitest';
import { buildImportSql, normalizeDate, sqlStr } from '../../scripts/build-import-sql';

const MAIN =
  '追加日,タグ,タイトル,概要,URL,DOI,年,出版国,出版社,ジャーナル,Impact Factor,カンファレンス,CORE Ranking,BibTeXキー,読了状態,メモ,引用状態\n' +
  '2025/03/01,"IPv6, NDP","Paper ""One""",概要1,https://a,10.1/a,2024,日本,,J,3.2,,,one2024,精読済,メモ,"論文A: 引用する, 論文B: 気になる"\n' +
  ',,,,,,,,,,,,,,,,\n' +
  ',未登録タグ,Paper Two,,,,2023,,,,,IMC,A,two2023,,,"論文C: 不正な状態"\n';
const TAGS = 'タグ\nNDP\nIPv6\n';
const PROJECTS = 'プロジェクト\n論文A\n';
const LAYOUT = 'カード配置データ (アプリが自動管理。手で編集しないこと)\n"[[""Paper One""],[""Paper Two""]]"\n';

const MAIN_HEADER =
  '追加日,タグ,タイトル,概要,URL,DOI,年,出版国,出版社,ジャーナル,Impact Factor,カンファレンス,CORE Ranking,BibTeXキー,読了状態,メモ,引用状態';

/** ヘッダ行 + 1 行の CSV を組み立てる (未指定の列は空欄) */
function mainCsvRow(fields: Partial<Record<
  '追加日' | 'タグ' | 'タイトル' | '概要' | 'URL' | 'DOI' | '年' | '出版国' | '出版社' | 'ジャーナル' |
  'Impact Factor' | 'カンファレンス' | 'CORE Ranking' | 'BibTeXキー' | '読了状態' | 'メモ' | '引用状態',
  string
>>): string {
  const order = MAIN_HEADER.split(',') as (keyof typeof fields)[];
  const csvField = (v: string) => (/[,"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const row = order.map((name) => csvField(fields[name] ?? ''));
  return MAIN_HEADER + '\n' + row.join(',') + '\n';
}

describe('helpers', () => {
  it('normalizeDate accepts / - . and falls back', () => {
    expect(normalizeDate('2025/3/1', '2026-01-01')).toBe('2025-03-01');
    expect(normalizeDate('2025-03-01', '2026-01-01')).toBe('2025-03-01');
    expect(normalizeDate('', '2026-01-01')).toBe('2026-01-01');
    expect(normalizeDate('garbage', '2026-01-01')).toBe('2026-01-01');
  });
  it('normalizeDate accepts YYYY年M月D日 (F2)', () => {
    expect(normalizeDate('2025年3月1日', '2026-01-01')).toBe('2025-03-01');
  });
  it('sqlStr escapes quotes and strips NUL', () => {
    expect(sqlStr("it's\u0000")).toBe("'it''s'");
  });
});

describe('buildImportSql', () => {
  it('emits entries, tags (sheet order first), entry_tags, projects and cites, but no layout', () => {
    const { sql, summary } = buildImportSql({ main: MAIN, tags: TAGS, projects: PROJECTS, layout: LAYOUT }, '2026-09-27');
    expect(summary).toEqual({ entries: 2, tags: 3, projects: 2, cites: 2, dateFallbacks: 0 }); // 論文C は状態が不正なので登録されない
    expect(sql).toContain("INSERT INTO entries (id, added, title, summary, url, doi, year, country, publisher, journal, impact_factor, conference, core, bibkey, read, note) VALUES (1, '2025-03-01', 'Paper \"One\"', '概要1', 'https://a', '10.1/a', '2024', '日本', '', 'J', '3.2', '', '', 'one2024', '精読済', 'メモ');");
    expect(sql).toContain("VALUES (2, '2026-09-27', 'Paper Two'");
    expect(sql).toContain("INSERT INTO tags (id, name, sort_order) VALUES (1, 'NDP', 0);");
    expect(sql).toContain("INSERT INTO tags (id, name, sort_order) VALUES (2, 'IPv6', 1);");
    expect(sql).toContain("INSERT INTO tags (id, name, sort_order) VALUES (3, '未登録タグ', 2);");
    expect(sql).toContain('INSERT INTO entry_tags (entry_id, tag_id, position) VALUES (1, 2, 0);');
    expect(sql).toContain('INSERT INTO entry_tags (entry_id, tag_id, position) VALUES (1, 1, 1);');
    expect(sql).toContain("INSERT INTO projects (id, name, sort_order) VALUES (1, '論文A', 0);");
    expect(sql).toContain("INSERT INTO projects (id, name, sort_order) VALUES (2, '論文B', 1);");
    expect(sql).toContain("INSERT INTO cites (entry_id, project_id, state) VALUES (1, 1, '引用する');");
    expect(sql).toContain("INSERT INTO cites (entry_id, project_id, state) VALUES (1, 2, '気になる');");
    expect(sql).not.toContain('不正な状態');
    expect(sql).not.toContain('INSERT INTO settings');
    expect(sql).not.toContain('Paper One"]');
    expect(sql).not.toMatch(/BEGIN|COMMIT/);
  });
  it('works with only the main CSV and skips rows without a title', () => {
    const { summary, sql } = buildImportSql({ main: MAIN }, '2026-09-27');
    expect(summary).toMatchObject({ entries: 2 });
    expect(sql).toContain("INSERT INTO tags (id, name, sort_order) VALUES (1, 'IPv6', 0);");
  });
  it('fails on unknown header', () => {
    expect(() => buildImportSql({ main: 'a,b\n1,2\n' }, '2026-09-27')).toThrow('メインシートの見出し行に「タイトル」列がありません');
  });

  it('dedupes a repeated project in 引用状態, last state wins (F1)', () => {
    const main = mainCsvRow({ タイトル: 'Dup Cite Paper', 引用状態: 'P: 気になる, P: 引用する' });
    const { sql, summary } = buildImportSql({ main }, '2026-09-27');
    expect(summary.cites).toBe(1);
    expect(sql).toContain("INSERT INTO cites (entry_id, project_id, state) VALUES (1, 1, '引用する');");
    expect(sql).not.toContain('気になる');
  });

  it('counts unparsable 追加日 values as dateFallbacks and still emits a valid date (F2)', () => {
    const main = mainCsvRow({ 追加日: 'March 1, 2025', タイトル: 'Unparsable Date Paper' });
    const { sql, summary } = buildImportSql({ main }, '2026-09-27');
    expect(summary.dateFallbacks).toBe(1);
    expect(sql).toContain("VALUES (1, '2026-09-27', 'Unparsable Date Paper'");
  });

  it('does not count an empty 追加日 as a dateFallback', () => {
    const main = mainCsvRow({ タイトル: 'No Date Paper' });
    const { summary } = buildImportSql({ main }, '2026-09-27');
    expect(summary.dateFallbacks).toBe(0);
  });

  it('dedupes a tag name repeated in the tags sheet (F7)', () => {
    const main = mainCsvRow({ タイトル: 'Tag Dedupe Paper' });
    const tags = 'タグ\nDupTag\nDupTag\n';
    const { sql } = buildImportSql({ main, tags }, '2026-09-27');
    const matches = sql.match(/INSERT INTO tags \(id, name, sort_order\) VALUES \(\d+, 'DupTag',/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('ignores the layout CSV, even if it is not JSON', () => {
    const main = mainCsvRow({ タイトル: 'Layout Paper' });
    const layout = 'カード配置データ\nnot json\n';
    const { sql } = buildImportSql({ main, layout }, '2026-09-27');
    expect(sql).not.toContain('settings');
    expect(sql).not.toContain('not json');
  });

  it('falls back an unknown 読了状態 value to 未読 (F7)', () => {
    const main = mainCsvRow({ タイトル: 'Unknown Read Paper', 読了状態: '不明' });
    const { sql } = buildImportSql({ main }, '2026-09-27');
    expect(sql).not.toContain("'不明'");
    expect(sql).toContain("'未読'");
  });

  it('strips a NUL byte inside a CSV field end-to-end (F7)', () => {
    const main = mainCsvRow({ タイトル: 'NUL\u0000Paper' });
    const { sql } = buildImportSql({ main }, '2026-09-27');
    expect(sql).toContain("'NULPaper'");
    expect(sql).not.toContain('\u0000');
  });
});
