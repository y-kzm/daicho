#!/usr/bin/env node
// wrangler.toml のプレースホルダを実際の D1 の ID に置き換え、
// wrangler.deploy.toml (gitignore 済み) を書き出す。
// ID は環境変数 D1_DATABASE_ID、なければ .env から読む。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';
const SOURCE = 'wrangler.toml';
const OUTPUT = 'wrangler.deploy.toml';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message) {
  console.error(`render-wrangler-config: ${message}`);
  process.exit(1);
}

function readDotEnv(name) {
  if (!existsSync('.env')) return '';
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && m[1] === name) return m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return '';
}

const id = (process.env.D1_DATABASE_ID || readDotEnv('D1_DATABASE_ID')).trim();
if (!id) {
  fail('D1_DATABASE_ID がありません。Workers Builds の変数か .env に設定してください (BUILD.md の手順 2)。');
}
if (!UUID.test(id)) fail('D1_DATABASE_ID の形式が正しくありません (UUID を指定します)。');
if (id === PLACEHOLDER) fail('D1_DATABASE_ID がプレースホルダのままです。');

const source = readFileSync(SOURCE, 'utf8');
if (!source.includes(PLACEHOLDER)) {
  fail(`${SOURCE} にプレースホルダ ${PLACEHOLDER} がありません。実際の ID を直接書いていないか確認してください。`);
}

writeFileSync(OUTPUT, source.split(PLACEHOLDER).join(id));
console.log(`render-wrangler-config: ${OUTPUT} を書き出しました。`);
