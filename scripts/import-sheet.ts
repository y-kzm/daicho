import { readFileSync } from 'node:fs';
import { buildImportSql } from './build-import-sql';

const USAGE =
  'usage: npm run import-sheet --silent -- --main main.csv [--tags tags.csv] [--projects projects.csv] [--layout layout.csv] > import.sql';

function usageError(): never {
  console.error(USAGE);
  process.exit(1);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) usageError();
  return v;
}

const main = arg('main');
if (!main) usageError();
const read = (p: string | undefined) => (p ? readFileSync(p, 'utf8') : undefined);
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const { sql, summary } = buildImportSql(
  { main: readFileSync(main, 'utf8'), tags: read(arg('tags')), projects: read(arg('projects')), layout: read(arg('layout')) },
  today,
);
process.stdout.write(sql);
console.error(`entries=${summary.entries} tags=${summary.tags} projects=${summary.projects} cites=${summary.cites}`);
if (summary.dateFallbacks > 0) {
  console.error(`登録日を解釈できず本日扱い: ${summary.dateFallbacks} 件`);
}
