import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    // Los tests usan el código fuente de los paquetes, sin compilar antes.
    alias: {
      '@turnoextra/db/testing': src('./packages/db/src/testing.ts'),
      '@turnoextra/db': src('./packages/db/src/index.ts'),
      '@turnoextra/channels': src('./packages/channels/src/index.ts'),
      '@turnoextra/shared': src('./packages/shared/src/index.ts'),
    },
  },
  test: {
    include: ['apps/**/test/**/*.test.ts', 'packages/**/test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
