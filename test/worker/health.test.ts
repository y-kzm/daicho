import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/worker/index';

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await createApp().request('/api/health', {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('applied migrations (entries table exists)', async () => {
    const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entries'").first<{ name: string }>();
    expect(row?.name).toBe('entries');
  });
});
