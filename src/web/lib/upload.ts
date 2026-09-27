import { PDF_MAX_BYTES } from '../../shared/types';

export const PDF_MIME = 'application/pdf';
const MAGIC = '%PDF-';

/** 大きさを読みやすい単位で表す (1024 単位) */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** 先頭の数バイトが PDF の印かどうか (拡張子や種類の表示だけを変えたファイルを除く) */
export function looksLikePdf(head: Uint8Array): boolean {
  if (head.length < MAGIC.length) return false;
  for (let i = 0; i < MAGIC.length; i++) if (head[i] !== MAGIC.charCodeAt(i)) return false;
  return true;
}

/** 送る前の確認。問題があれば利用者向けの文、無ければ null */
export function checkPdf(file: { name: string; size: number; type: string }, head: Uint8Array): string | null {
  if (file.size <= 0) return '空のファイルです。';
  if (file.size > PDF_MAX_BYTES) return `PDF は ${PDF_MAX_BYTES / 1024 / 1024} MB までです (このファイルは ${formatBytes(file.size)})。`;
  // 種類が空のブラウザもあるので、拡張子でも受け付ける。中身は先頭の印で確かめる
  const named = file.type === PDF_MIME || (file.type === '' && /\.pdf$/i.test(file.name));
  if (!named || !looksLikePdf(head)) return 'PDF ファイルを選んでください。';
  return null;
}

export class UploadError extends Error {}

/**
 * Google が発行した送信先へ PDF を直接送る。戻り値は Drive のファイル id。
 * 進み具合を出すために XMLHttpRequest を使う (fetch は送信の進み具合を取れない)。
 */
export function uploadPdf(
  uploadUrl: string, file: Blob, onProgress: (ratio: number) => void, signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // 中止済みの signal は abort を通知しないので、送り始める前に確かめる
    if (signal?.aborted) { reject(new UploadError('アップロードを中止しました。')); return; }
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('content-type', PDF_MIME);
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable && ev.total > 0) onProgress(ev.loaded / ev.total); };
    xhr.onerror = () => reject(new UploadError('Google Drive へ送信できませんでした。通信を確認してやり直してください。'));
    xhr.onabort = () => reject(new UploadError('アップロードを中止しました。'));
    xhr.onload = () => {
      let id = '';
      try { id = String((JSON.parse(xhr.responseText) as { id?: unknown }).id ?? ''); } catch { id = ''; }
      if (xhr.status >= 200 && xhr.status < 300 && id) resolve(id);
      else reject(new UploadError(`Google Drive が保存を受け付けませんでした (${xhr.status})。`));
    };
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}
