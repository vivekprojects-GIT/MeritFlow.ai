import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    /* Integration specs drive a real headless browser and a real database, so
       the default 5s timeout fails them for being slow rather than wrong. */
    testTimeout: 120_000,
    hookTimeout: 120_000,
    /* One at a time. The integration suites open PGlite, which is
       single-process and corrupts if two workers touch the same directory —
       this has already destroyed a database once. */
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
  },
});
