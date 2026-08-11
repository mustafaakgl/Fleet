import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodePolyline } from './decode-polyline';

/**
 * Beklenen degerler UYDURULMADI: uretimde calisan web cozucusunun
 * (frontend/lib/decode-polyline.ts) ayni girdilere verdigi cikti alindi.
 * Bu testin isi, mobil kopyanin o cozucuden SAPMADIGINI garanti etmek —
 * iki taraf ayni rotayi farkli cizerse hata sahada ortaya cikar.
 */
describe('decodePolyline', () => {
  it('returns nothing for an empty shape', () => {
    assert.deepEqual(decodePolyline(''), []);
  });

  it('matches the web decoder on a two-point shape', () => {
    assert.deepEqual(decodePolyline('_gjaiAncq}D_pR_pR'), [
      [38.83584, -3.122248],
      [38.84584, -3.112248],
    ]);
  });

  it('matches the web decoder on a three-point shape', () => {
    assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [
      [3.85, -12.02],
      [4.07, -12.095],
      [4.3252, -12.6453],
    ]);
  });

  it('keeps repeated points instead of collapsing them', () => {
    // Duran arac ayni koordinati iki kez uretebiliyor; cizim bunu tolere etmeli.
    assert.deepEqual(decodePolyline('ohlgHqxs@??'), [
      [4.856472, 0.027033],
      [4.856472, 0.027033],
    ]);
  });

  it('shifts coordinates tenfold at the wrong precision', () => {
    // Yanlis hassasiyet bos ekran degil, YANLIS YER uretir. Haritada rota
    // baska kitada gorunuyorsa once buraya bakilir.
    const right = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 6)[0];
    const wrong = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)[0];

    assert.ok(Math.abs(wrong[0] - right[0] * 10) < 0.001, `${wrong[0]} vs ${right[0]}`);
  });
});
