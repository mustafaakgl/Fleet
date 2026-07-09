import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toWinAnsiSafeText } from './pdf-text.util';

describe('toWinAnsiSafeText', () => {
  it('maps Turkish-specific letters to WinAnsi equivalents', () => {
    assert.equal(toWinAnsiSafeText('İmza: Işık Ağaç Şoför'), 'Imza: Isik Agaç Soför');
  });

  it('keeps German umlauts and cp1252 extras untouched', () => {
    assert.equal(
      toWinAnsiSafeText('Aushändigungsbestätigung – Größe „XL“ €'),
      'Aushändigungsbestätigung – Größe „XL“ €',
    );
  });

  it('replaces characters outside WinAnsi with a question mark', () => {
    assert.equal(toWinAnsiSafeText('Fahrer 张伟 ✓'), 'Fahrer ?? ?');
  });

  it('keeps plain ASCII unchanged', () => {
    assert.equal(toWinAnsiSafeText('Arbeitskleidung Ausgabe x3'), 'Arbeitskleidung Ausgabe x3');
  });
});
