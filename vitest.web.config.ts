import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/web/**/*.test.ts'], environment: 'node', passWithNoTests: true },
});
