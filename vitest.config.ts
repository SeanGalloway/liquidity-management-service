import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'server-only': path('./test/stubs/empty.ts'),
      '@server': path('./src/server'),
      '@client': path('./src/client'),
      '@shared': path('./src/shared'),
      '@test': path('./test'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts', 'db/**/*.test.ts'],
    environment: 'node',
  },
});
