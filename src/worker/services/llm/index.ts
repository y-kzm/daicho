import type { LlmProvider } from '../../../shared/types';
import type { Env } from '../../env';
import { AppError } from '../../errors';
import type { Http } from '../http';
import { claudeGenerate } from './claude';
import { geminiGenerate } from './gemini';

export function llmGenerate(http: Http, env: Env, provider: LlmProvider | undefined, prompt: string): Promise<string> {
  return provider === 'claude'
    ? claudeGenerate(http, env.ANTHROPIC_API_KEY, prompt)
    : geminiGenerate(http, env.GEMINI_API_KEY, prompt);
}

export function providerLabel(provider: LlmProvider | undefined): string {
  return provider === 'claude' ? 'Claude Haiku' : 'Gemini';
}

export function parseJsonLoose(text: string, kind: 'array' | 'object'): unknown {
  const cleaned = String(text || '').replace(/```[a-z]*\n?/gi, '').trim();
  const m = cleaned.match(kind === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/);
  if (!m) throw new AppError('AI の応答を JSON として解釈できませんでした。', 502);
  try {
    return JSON.parse(m[0]);
  } catch {
    throw new AppError('AI の応答を JSON として解釈できませんでした。', 502);
  }
}
