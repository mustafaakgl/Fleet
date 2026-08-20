import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  activeFingerprintFor,
  buildRequestFingerprint,
  canRetryGeneration,
  completionCasWhere,
  evaluateCompletion,
  isLiveGeneration,
  type StoredGeneration,
} from './dispatch-generation';

/**
 * URETIM YASAM DONGUSU VE EXACTLY-ONCE (Faz 17).
 *
 * Olculen sey tek: NULLABLE bir `@unique` tek basina exactly-once vermez ve
 * bosluklarin hepsi baska bir mekanizmayla kapatilmis mi.
 */

const ORDERS = [
  { transportOrderId: 'ord-1', sourceRevision: 3 },
  { transportOrderId: 'ord-2', sourceRevision: 1 },
];

function stored(overrides: Partial<StoredGeneration> = {}): StoredGeneration {
  return {
    jobId: 'job-1',
    jobAttempt: 1,
    generation: 'processing',
    proposalId: null,
    orders: ORDERS,
    ...overrides,
  };
}

function current(overrides: Record<string, number> = {}) {
  return ORDERS.map((order) => ({
    transportOrderId: order.transportOrderId,
    currentRevision: overrides[order.transportOrderId] ?? order.sourceRevision,
  }));
}

const CONTEXT = { dispatchProposalId: 'dp-1', jobId: 'job-1', attempt: 1 };

// ---------------------------------------------------------------------------
// Parmak izi
// ---------------------------------------------------------------------------

describe('Istek parmak izi', () => {
  const base = { tenantId: 't1', orders: ORDERS, workDate: '2026-09-01' };

  it('AYNI baglam AYNI parmak izini verir', () => {
    assert.equal(buildRequestFingerprint(base), buildRequestFingerprint(base));
  });

  it('SIRALAMA baglami degistirmez', () => {
    assert.equal(
      buildRequestFingerprint(base),
      buildRequestFingerprint({ ...base, orders: [...ORDERS].reverse() }),
    );
  });

  it('REVIZYON degisince parmak izi DEGISIR — degismis siparis yeniden planlanabilir', () => {
    assert.notEqual(
      buildRequestFingerprint(base),
      buildRequestFingerprint({
        ...base,
        orders: [{ transportOrderId: 'ord-1', sourceRevision: 4 }, ORDERS[1]!],
      }),
    );
  });

  it('IS GUNU degisince parmak izi degisir', () => {
    assert.notEqual(
      buildRequestFingerprint(base),
      buildRequestFingerprint({ ...base, workDate: '2026-09-02' }),
    );
  });

  it('KIRACI parmak izine dahil', () => {
    assert.notEqual(
      buildRequestFingerprint(base),
      buildRequestFingerprint({ ...base, tenantId: 't2' }),
    );
  });
});

describe('Aktif parmak izi — tekillik tasiyicisi', () => {
  const fp = 'abc';

  it('uretim surerken DOLU', () => {
    for (const generation of ['queued', 'processing'] as const) {
      assert.equal(isLiveGeneration(generation, 'open'), true, generation);
      assert.equal(
        activeFingerprintFor({ requestFingerprint: fp, generation, status: 'open' }),
        fp,
      );
    }
  });

  it('hazir ve KARAR BEKLERKEN dolu — ayni istek yeni oneri acmaz', () => {
    assert.equal(
      activeFingerprintFor({ requestFingerprint: fp, generation: 'ready', status: 'open' }),
      fp,
    );
  });

  it('KARARA BAGLANINCA birakiliyor — ayni siparis sonra yeniden planlanabilir', () => {
    for (const status of ['approved', 'rejected', 'superseded'] as const) {
      assert.equal(
        activeFingerprintFor({ requestFingerprint: fp, generation: 'ready', status }),
        null,
        status,
      );
    }
  });

  it('BASARISIZ ve SURESI DOLMUS oneri alani birakiyor — yeniden calistirilabilir', () => {
    for (const generation of ['failed', 'expired'] as const) {
      assert.equal(
        activeFingerprintFor({ requestFingerprint: fp, generation, status: 'open' }),
        null,
        generation,
      );
      assert.equal(canRetryGeneration(generation), true);
    }
  });

  it('HAZIR ve CALISAN oneri yeniden calistirilamaz', () => {
    // `ready` icin yeni bir TALEP acilir; eski oneri denetimde kalmali.
    // `processing` icin ikinci is, ayni oneriye iki cikti yarisi baslatirdi.
    assert.equal(canRetryGeneration('ready'), false);
    assert.equal(canRetryGeneration('processing'), false);
    assert.equal(canRetryGeneration('queued'), false);
  });
});

// ---------------------------------------------------------------------------
// Worker tamamlamasi — CAS
// ---------------------------------------------------------------------------

describe('Worker tamamlamasi', () => {
  it('dogru is, dogru deneme, guncel revizyon KABUL', () => {
    const decision = evaluateCompletion(stored(), { ...CONTEXT, currentRevisions: current() });
    assert.deepEqual(decision, { accept: true });
  });

  it('BASKA ISE ait cevap reddedilir', () => {
    const decision = evaluateCompletion(stored(), {
      ...CONTEXT,
      jobId: 'job-baska',
      currentRevisions: current(),
    });
    assert.deepEqual(decision, { accept: false, reason: 'wrong_job' });
  });

  it('isi olmayan talebe cevap yazilamaz', () => {
    const decision = evaluateCompletion(stored({ jobId: null }), {
      ...CONTEXT,
      currentRevisions: current(),
    });
    assert.deepEqual(decision, { accept: false, reason: 'wrong_job' });
  });

  it('BAYAT DENEME reddedilir — yeniden denenen isin eski cevabi yazamaz', () => {
    const decision = evaluateCompletion(stored({ jobAttempt: 2 }), {
      ...CONTEXT,
      attempt: 1,
      currentRevisions: current(),
    });
    assert.deepEqual(decision, { accept: false, reason: 'stale_attempt' });
  });

  it('`processing` OLMAYAN talebe cevap yazilamaz', () => {
    for (const generation of ['queued', 'ready', 'failed', 'expired'] as const) {
      const decision = evaluateCompletion(stored({ generation }), {
        ...CONTEXT,
        currentRevisions: current(),
      });
      assert.deepEqual(decision, { accept: false, reason: 'not_processing' }, generation);
    }
  });

  it('IKINCI CEVAP ikinci baglanti olusturamaz', () => {
    const decision = evaluateCompletion(stored({ proposalId: 'prop-1' }), {
      ...CONTEXT,
      currentRevisions: current(),
    });
    assert.deepEqual(decision, { accept: false, reason: 'already_linked' });
  });

  it('SIPARIS REVIZE EDILDIYSE gec cevap baglanmaz', () => {
    const decision = evaluateCompletion(stored(), {
      ...CONTEXT,
      currentRevisions: current({ 'ord-1': 4 }),
    });
    assert.deepEqual(decision, { accept: false, reason: 'stale_revision' });
  });

  it('SIPARIS KAYBOLDUYSA da bayat sayilir', () => {
    const decision = evaluateCompletion(stored(), {
      ...CONTEXT,
      currentRevisions: [{ transportOrderId: 'ord-1', currentRevision: 3 }],
    });
    assert.deepEqual(decision, { accept: false, reason: 'stale_revision' });
  });
});

describe('CAS kosulu', () => {
  it('bes kosulun HEPSI `where` icinde', () => {
    const where = completionCasWhere(CONTEXT);
    assert.deepEqual(where, {
      id: 'dp-1',
      jobId: 'job-1',
      jobAttempt: 1,
      generation: 'processing',
      proposalId: null,
    });
  });

  it('`proposalId: null` kosulu ZORUNLU — olmadan gec cevap ezerdi', () => {
    // Bu alanin silinmesi exactly-once garantisini sessizce kaldirirdi.
    assert.equal('proposalId' in completionCasWhere(CONTEXT), true);
    assert.equal(completionCasWhere(CONTEXT).proposalId, null);
  });
});

// ---------------------------------------------------------------------------
// Istenen eszamanlilik senaryolari
// ---------------------------------------------------------------------------

describe('Eszamanlilik senaryolari', () => {
  it('AYNI API ISTEGI IKI KEZ: ikinci istek ayni parmak izini uretir', () => {
    // Ayni parmak izi + `activeFingerprint` tekilligi = ikinci kayit acilamaz.
    const first = buildRequestFingerprint({ tenantId: 't1', orders: ORDERS, workDate: '2026-09-01' });
    const second = buildRequestFingerprint({ tenantId: 't1', orders: ORDERS, workDate: '2026-09-01' });
    assert.equal(first, second);
    assert.equal(
      activeFingerprintFor({ requestFingerprint: first, generation: 'processing', status: 'open' }),
      first,
    );
  });

  it('IKI WORKER YARISI: ilki baglar, ikincisi `already_linked`', () => {
    const before = evaluateCompletion(stored(), { ...CONTEXT, currentRevisions: current() });
    assert.equal(before.accept, true);
    // Ilk cevap baglandi; ayni kayit artik `proposalId` tasiyor.
    const after = evaluateCompletion(stored({ proposalId: 'prop-1', generation: 'ready' }), {
      ...CONTEXT,
      currentRevisions: current(),
    });
    assert.equal(after.accept, false);
  });

  it('BASARISIZ IS RETRY: alan birakilir, yeni uretim mesru', () => {
    assert.equal(canRetryGeneration('failed'), true);
    assert.equal(
      activeFingerprintFor({ requestFingerprint: 'fp', generation: 'failed', status: 'open' }),
      null,
    );
  });

  it('BILINCLI RE-PLAN: karar verilmis oneri yeni uretimi engellemez', () => {
    // `(order, revision)` uzerine kalici unique olsaydi bu imkansiz olurdu.
    assert.equal(
      activeFingerprintFor({ requestFingerprint: 'fp', generation: 'ready', status: 'approved' }),
      null,
    );
  });
});

describe('Superseded — artik AKTIF DEGIL', () => {
  it('aktif parmak izi BIRAKILIR', () => {
    assert.equal(
      activeFingerprintFor({ requestFingerprint: 'fp', generation: 'failed', status: 'superseded' }),
      null,
    );
    assert.equal(isLiveGeneration('failed', 'superseded'), false);
  });

  it('GEC WORKER CEVABI baglanamaz', () => {
    // `processing` degil: cevap `not_processing` ile reddedilir.
    const decision = evaluateCompletion(stored({ generation: 'failed' }), {
      ...CONTEXT,
      currentRevisions: current(),
    });
    assert.deepEqual(decision, { accept: false, reason: 'not_processing' });
  });

  it('ESKI REVIZYON yeniden calistirilamaz — yeni talep acilmali', () => {
    // `failed` normalde retry edilebilir; `superseded` EDILEMEZ cunku
    // kayitli sourceRevision degerleri artik eski.
    assert.equal(canRetryGeneration('failed', 'open'), true);
    assert.equal(canRetryGeneration('failed', 'superseded'), false);
    assert.equal(canRetryGeneration('expired', 'superseded'), false);
  });

  it('YENI REVIZYON hemen planlanabilir — parmak izi farkli', () => {
    const base = { tenantId: 't1', workDate: '2026-09-01' };
    const eski = buildRequestFingerprint({ ...base, orders: ORDERS });
    const yeni = buildRequestFingerprint({
      ...base,
      orders: [{ transportOrderId: 'ord-1', sourceRevision: 4 }, ORDERS[1]!],
    });
    assert.notEqual(eski, yeni);
    // Eski oneri aktif parmak izini biraktigi icin yeni talep engellenmiyor.
    assert.equal(
      activeFingerprintFor({ requestFingerprint: eski, generation: 'failed', status: 'superseded' }),
      null,
    );
  });
});
