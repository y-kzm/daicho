import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
  return {
    test: {
      include: ['test/worker/**/*.test.ts'],
      setupFiles: ['./test/worker/apply-migrations.ts'],
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.toml' },
          miniflare: {
            bindings: { TEST_MIGRATIONS: migrations, GEMINI_API_KEY: 'test-gemini', ANTHROPIC_API_KEY: 'test-claude' },
          },
        },
      },
    },
  };
});
