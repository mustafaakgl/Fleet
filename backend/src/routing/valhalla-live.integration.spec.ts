import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RoutingCacheService } from './routing-cache.service';
import { RoutingService } from './routing.service';
import { ValhallaClient } from './valhalla.client';
import { DEFAULT_TRUCK_PROFILE, type GeoPoint } from './core/routing.types';

/**
 * GERCEK Valhalla'ya karsi OPT-IN entegrasyon testi.
 *
 * NEDEN VAR: yakit rotasi sapmasi, matris hucrelerinin dogru kaynak/hedef
 * ciftine eslendigi varsayimina dayaniyor. Birim testler bu eslemeyi ELLE
 * KURULMUS hucrelerle dogruluyor — yani kendi varsayimimizi kendimize
 * dogrulatiyoruz. Gercek indeks sirasi ancak gercek Valhalla ile kanitlanir.
 *
 * VARSAYILAN OLARAK ATLANIR: `VALHALLA_LIVE_URL` verilmedikce hicbir ag cagrisi
 * yapilmaz ve test acikca skip olur. Boylece `npm test` bu makinede de,
 * Valhalla'nin kurulu oldugu ortamda da ayni komutla calisir.
 *
 * Calistirmak icin:
 *   VALHALLA_LIVE_URL=http://localhost:8002 npm test
 *
 * DIKKAT: `VALHALLA_URL` degil AYRI bir degisken kullaniliyor. Uygulamanin
 * calisma zamani yapilandirmasi ile test opt-in'i karistirilmamali; aksi halde
 * VALHALLA_URL tanimli her ortamda (yani uretimde) bu testler ag cagrisi
 * yapmaya calisirdi.
 */

const LIVE_URL = process.env.VALHALLA_LIVE_URL?.trim();
const skip = LIVE_URL
  ? false
  : 'VALHALLA_LIVE_URL not set — real Valhalla verification skipped (opt-in).';

/** Duisburg / Oberhausen / Mulheim — NRW tile kapsaminda uc gercek nokta. */
const A: GeoPoint = { latitude: 51.4344, longitude: 6.7623 };
const B: GeoPoint = { latitude: 51.4963, longitude: 6.8638 };
const C: GeoPoint = { latitude: 51.4275, longitude: 6.8825 };

function buildRouting(timeoutMs?: number) {
  const previousUrl = process.env.VALHALLA_URL;
  const previousTimeout = process.env.VALHALLA_TIMEOUT_MS;

  process.env.VALHALLA_URL = LIVE_URL;
  if (timeoutMs !== undefined) {
    process.env.VALHALLA_TIMEOUT_MS = String(timeoutMs);
  }

  const restore = () => {
    if (previousUrl === undefined) delete process.env.VALHALLA_URL;
    else process.env.VALHALLA_URL = previousUrl;
    if (previousTimeout === undefined) delete process.env.VALHALLA_TIMEOUT_MS;
    else process.env.VALHALLA_TIMEOUT_MS = previousTimeout;
  };

  // Onbellek devre disi: her iddia gercek servisten dogrulanmali.
  const cache = {
    get: async () => null,
    set: async () => undefined,
  } as unknown as RoutingCacheService;

  const client = new ValhallaClient();
  // Prisma ve geocoding bu testte kullanilmiyor: yalnizca rota/matris yollari
  // sinaniyor, adres cozumleme yok.
  const routing = new RoutingService({} as never, client, {} as never, cache);
  return { routing, client, restore };
}

describe('Valhalla live verification (opt-in)', () => {
  it('is reachable and reports a version', { skip }, async () => {
    const { client, restore } = buildRouting();
    try {
      const status = await client.status();
      assert.equal(status.ok, true, 'real Valhalla must answer /status');
    } finally {
      restore();
    }
  });

  it('maps rectangular matrix cells to the right source/target pair', { skip }, async () => {
    const { routing, restore } = buildRouting();
    try {
      // Tek kaynak, iki hedef: hucre indeksleri hedef sirasini takip etmeli.
      const matrix = await routing.matrixBetween([A], [B, C], DEFAULT_TRUCK_PROFILE);
      assert.equal(matrix.ok, true, 'matrix call must succeed');
      if (!matrix.ok) return;

      const toB = matrix.value.find((cell) => cell.sourceIndex === 0 && cell.targetIndex === 0);
      const toC = matrix.value.find((cell) => cell.sourceIndex === 0 && cell.targetIndex === 1);
      assert.ok(toB, 'cell (0,0) must exist');
      assert.ok(toC, 'cell (0,1) must exist');

      // ASIL IDDIA: matris hucreleri, ayni ciftin nokta-nokta rotasiyla
      // ORTUSMELI. Ortusmezse indeksler kaymis demektir ve sapma hesabi
      // yanlis istasyona ait olurdu.
      const routeB = await routing.routeBetween(A, B, DEFAULT_TRUCK_PROFILE);
      const routeC = await routing.routeBetween(A, C, DEFAULT_TRUCK_PROFILE);
      assert.equal(routeB.ok && routeC.ok, true, 'both reference routes must succeed');
      if (!routeB.ok || !routeC.ok) return;

      const tolerance = 0.15; // %15: matris ve rota motoru ayni ag, kucuk fark normal
      const close = (matrixKm: number | null, routeKm: number) =>
        matrixKm !== null && Math.abs(matrixKm - routeKm) <= routeKm * tolerance;

      assert.ok(
        close(toB!.distanceKm, routeB.value.distanceKm),
        `cell (0,0)=${toB!.distanceKm} km must match route A->B=${routeB.value.distanceKm} km`,
      );
      assert.ok(
        close(toC!.distanceKm, routeC.value.distanceKm),
        `cell (0,1)=${toC!.distanceKm} km must match route A->C=${routeC.value.distanceKm} km`,
      );

      // Iki hedef gercekten AYRI: ayni degeri dondurmus olsaydi esleme testi
      // anlamsiz olurdu.
      assert.notEqual(
        Math.round(routeB.value.distanceKm * 10),
        Math.round(routeC.value.distanceKm * 10),
        'the two reference routes must differ for this test to prove anything',
      );
    } finally {
      restore();
    }
  });

  it('maps multi-source matrix rows to the right source', { skip }, async () => {
    const { routing, restore } = buildRouting();
    try {
      // Iki kaynak, tek hedef — yakit akisindaki ikinci matris cagrisinin sekli.
      const matrix = await routing.matrixBetween([B, C], [A], DEFAULT_TRUCK_PROFILE);
      assert.equal(matrix.ok, true);
      if (!matrix.ok) return;

      const fromB = matrix.value.find((cell) => cell.sourceIndex === 0 && cell.targetIndex === 0);
      const fromC = matrix.value.find((cell) => cell.sourceIndex === 1 && cell.targetIndex === 0);
      assert.ok(fromB && fromC, 'both source rows must exist');

      const routeB = await routing.routeBetween(B, A, DEFAULT_TRUCK_PROFILE);
      const routeC = await routing.routeBetween(C, A, DEFAULT_TRUCK_PROFILE);
      if (!routeB.ok || !routeC.ok) return;

      const tolerance = 0.15;
      assert.ok(
        fromB!.distanceKm !== null &&
          Math.abs(fromB!.distanceKm - routeB.value.distanceKm) <= routeB.value.distanceKm * tolerance,
        'row 0 must correspond to source B',
      );
      assert.ok(
        fromC!.distanceKm !== null &&
          Math.abs(fromC!.distanceKm - routeC.value.distanceKm) <= routeC.value.distanceKm * tolerance,
        'row 1 must correspond to source C',
      );
    } finally {
      restore();
    }
  });

  it('routes with the truck profile and never silently uses auto', { skip }, async () => {
    const { routing, restore } = buildRouting();
    try {
      const route = await routing.routeBetween(A, B, DEFAULT_TRUCK_PROFILE);
      assert.equal(route.ok, true, 'truck route must succeed against real Valhalla');
      if (!route.ok) return;

      assert.ok(route.value.distanceKm > 0, 'distance must be positive');
      assert.ok(route.value.durationMinutes > 0, 'duration must be positive');

      // Kamyon profili gercekten uygulanmis mi: asiri kisitli bir profil
      // (5 m yukseklik, 60 t) ayni cift icin ya daha uzun bir rota ya da
      // erisilemezlik uretmeli. Ayni sonucu verirse profil YOK SAYILIYOR.
      const restricted = await routing.routeBetween(A, B, {
        ...DEFAULT_TRUCK_PROFILE,
        height: 5.0,
        weight: 60,
        axleLoad: 13,
      });

      if (restricted.ok) {
        assert.ok(
          restricted.value.distanceKm >= route.value.distanceKm,
          'a more restricted truck profile must not produce a shorter route — ' +
            'if it does, costing_options are being ignored',
        );
      }
    } finally {
      restore();
    }
  });

  it('returns a controlled timeout result instead of hanging', { skip }, async () => {
    // 1 ms: gercek servis bu surede cevap veremez.
    const { routing, restore } = buildRouting(1);
    try {
      const matrix = await routing.matrixBetween([A], [B, C], DEFAULT_TRUCK_PROFILE);

      assert.equal(matrix.ok, false, 'a 1 ms timeout must not succeed');
      if (!matrix.ok) {
        // Istisna FIRLATILMIYOR, kontrollu sonuc donuyor — cagiran akis
        // (surucunun istasyon listesi) bu yuzden cokmuyor.
        assert.equal(matrix.error, 'unavailable');
      }
    } finally {
      restore();
    }
  });
});
