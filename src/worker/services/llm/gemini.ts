import { GEMINI_FALLBACK_MODEL, GEMINI_MODEL } from '../../config';
import { AppError } from '../../errors';
import { parseJson, type Http, type HttpResult } from '../http';

interface GeminiPayload {
  contents: { parts: { text: string }[] }[];
  generationConfig: { temperature: number; maxOutputTokens: number; thinkingConfig?: { thinkingBudget: number } };
}

export async function geminiGenerate(http: Http, apiKey: string | undefined, prompt: string): Promise<string> {
  if (!apiKey) {
    throw new AppError(
      'GEMINI_API_KEY が未設定です。`wrangler secret put GEMINI_API_KEY` で、Google AI Studio で発行した API キーを登録してください。',
    );
  }
  const models = [GEMINI_MODEL, GEMINI_FALLBACK_MODEL];
  let res: HttpResult = { status: 0, text: '' };
  outer: for (const model of models) {
    const payload: GeminiPayload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await http.postJson(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(apiKey),
        payload,
      );
      if (res.status === 200) break outer;
      if (res.status === 400 && payload.generationConfig.thinkingConfig) { delete payload.generationConfig.thinkingConfig; continue; }
      if (res.status === 503 || res.status === 429) { await http.sleep(1500 * (attempt + 1)); continue; }
      break outer;
    }
  }
  if (res.status === 503) throw new AppError('Gemini が混雑しています (503)。リトライと代替モデルでも失敗しました。数分待ってから再試行してください。', 502);
  if (res.status === 429) throw new AppError('Gemini の無料枠レート制限に達しました。少し待ってから再試行してください。', 502);
  if (res.status !== 200) throw new AppError('Gemini API エラー (HTTP ' + res.status + '): ' + res.text.slice(0, 200), 502);
  const body = parseJson<{ candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] }>(res.text);
  const cand = body?.candidates?.[0];
  const summary = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!summary) throw new AppError('Gemini から要約を取得できませんでした (finishReason: ' + (cand?.finishReason || '不明') + ')', 502);
  return summary;
}
