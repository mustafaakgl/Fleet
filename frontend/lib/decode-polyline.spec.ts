import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodePolyline } from './decode-polyline';

describe('decode-polyline', () => {
  it('returns an empty list for empty input', () => {
    assert.deepEqual(decodePolyline(''), []);
  });

  it('decodes the reference Google polyline vector at precision 5', () => {
    // Google'in belgelenmis ornek govdesi — cozucunun dogrulugunu bagimsiz
    // dogrular. Valhalla ayni algoritmayi precision 6 ile kullaniyor.
    const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const points = decodePolyline(encoded, 5);

    assert.equal(points.length, 3);
    assert.deepEqual(
      points.map(([lat, lng]) => [Number(lat.toFixed(5)), Number(lng.toFixed(5))]),
      [
        [38.5, -120.2],
        [40.7, -120.95],
        [43.252, -126.453],
      ],
    );
  });

  it('scales by precision — the wrong precision moves the route off the planet', () => {
    const encoded = '_p~iF~ps|U';
    const [correct] = decodePolyline(encoded, 5);
    const [wrong] = decodePolyline(encoded, 6);

    assert.equal(Number(correct[0].toFixed(1)), 38.5);
    // Bir basamak kayma: Valhalla precision 6 kullanir, 5 ile cozulurse
    // koordinat 10 kat buyur ve gecerli enlem araliginin disina cikar.
    assert.equal(Number(wrong[0].toFixed(2)), 3.85);
    assert.ok(Math.abs(correct[0]) <= 90);
  });

  it('handles a single point', () => {
    const points = decodePolyline('_p~iF~ps|U', 5);
    assert.equal(points.length, 1);
  });
});
