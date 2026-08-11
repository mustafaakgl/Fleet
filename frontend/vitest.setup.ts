import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

/**
 * i18n testte gercek ceviri yuklemez: anahtarin kendisi doner.
 *
 * Bilincli — test "Durak ekle" metnini degil `tourBuilder.addStop` anahtarini
 * arar. Boylece Almanca metin degistiginde testler kirilmaz, ama YANLIS
 * anahtar kullanildiginda kirilir. Ceviri varliginin denetimi ayri:
 * scripts/i18n-check.mjs.
 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && Object.keys(options).length > 0
        ? `${key} ${JSON.stringify(options)}`
        : key,
    i18n: { language: 'de', changeLanguage: () => Promise.resolve() },
  }),
}));
