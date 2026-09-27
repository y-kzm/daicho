import type { Http } from './http';

/** アクセント記号を除去し英数字のみの小文字に正規化 (例: "Lencsés" → "lencses") */
export function normalizeKeyPart(s: string): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

export async function urlExists(http: Http, url: string): Promise<boolean> {
  return (await http.get(url)).status === 200;
}
