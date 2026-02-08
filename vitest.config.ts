import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@quadbot/db': path.resolve(__dirname, 'packages/db/src'),
      '@quadbot/shared': path.resolve(__dirname, 'packages/shared/src'),
    },
  },
});
