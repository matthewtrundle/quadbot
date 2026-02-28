import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      reporter: ['text', 'text-summary'],
      include: ['apps/worker/src/jobs/**', 'apps/web/src/app/api/**'],
    },
  },
  resolve: {
    alias: {
      '@quadbot/db': path.resolve(__dirname, 'packages/db/src'),
      '@quadbot/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@/': path.resolve(__dirname, 'apps/web/src/'),
    },
  },
});
