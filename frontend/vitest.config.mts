import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Bilesen testleri.
 *
 * Kapsam bilincli olarak dar: `lib/` icindeki saf mantik ve tur kurma
 * bilesenleri. Sayfa/route testleri yok — onlar Next'in sunucu bilesenlerine
 * ve gercek API'ye baglanir, degerinden cok bakim maliyeti uretir.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['components/**/*.test.tsx', 'lib/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
