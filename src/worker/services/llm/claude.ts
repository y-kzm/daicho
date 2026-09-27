import { CLAUDE_MODEL } from '../../config';
import { AppError } from '../../errors';
import { parseJson, type Http, type HttpResult } from '../http';

export async function claudeGenerate(http: Http, apiKey: string | undefined, prompt: string): Promise<string> {
  if (!apiKey) {
    throw new AppError(
      'ANTHROPIC_API_KEY が未設定です。`wrangler secret put ANTHROPIC_API_KEY` で、Claude Console (platform.claude.com) で発行した API キーを登録してください。',
    );
  }
  let res: HttpResult = { status: 0, text: '' };
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await http.postJson(
      'https://api.anthropic.com/v1/messages',
      { model: CLAUDE_MODEL, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] },
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    );
    if (res.status === 429 || res.status === 529 || res.status === 503) { await http.sleep(1500 * (attempt + 1)); continue; }
    break;
  }
  if (res.status === 401) throw new AppError('Claude API キーが無効です。ANTHROPIC_API_KEY を確認してください。', 502);
  if (res.status === 429) throw new AppError('Claude API のレート制限に達しました。少し待ってから再試行してください。', 502);
  if (res.status === 529) throw new AppError('Claude API が過負荷です (529)。数分待ってから再試行してください。', 502);
  if (res.status !== 200) throw new AppError('Claude API エラー (HTTP ' + res.status + '): ' + res.text.slice(0, 200), 502);
  const body = parseJson<{ content?: { type: string; text?: string }[]; stop_reason?: string }>(res.text);
  const summary = (body?.content || []).filter((b) => b.type === 'text').map((b) => b.text || '').join('').trim();
  if (!summary) throw new AppError('Claude から要約を取得できませんでした (stop_reason: ' + (body?.stop_reason || '不明') + ')', 502);
  return summary;
}
