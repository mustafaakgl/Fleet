import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findDuplicateOrder,
  matchCompany,
  matchExistingOrder,
  normalizeCustomerNumber,
  normalizeReference,
  normalizeVatId,
  resolveIntentDecision,
  type CompanyCandidate,
  type CompanyMatch,
  type OrderCandidate,
  type OrderMatch,
} from './order-intake-match';

/**
 * DETERMINISTIK ESLESTIRME (Faz 16, bolum 3 ve 5).
 *
 * Buradaki testlerin cogu bir SALDIRI ya da bir SESSIZ HATA senaryosunun
 * karsiligi: taklit edilmis gonderen, paylasilan domain, iki musterinin ayni
 * referansi, belirsiz eslesme.
 */

const COMPANIES: CompanyCandidate[] = [
  {
    id: 'cmp-muster',
    name: 'Spedition Muster GmbH',
    vatId: 'DE123456789',
    email: 'dispo@muster.example',
    invoiceEmail: 'rechnung@muster.example',
    datevDebtorNumber: 10042,
  },
  {
    id: 'cmp-nord',
    name: 'Nord Logistik GmbH',
    vatId: 'DE987654321',
    email: 'dispo@nord.example',
    invoiceEmail: null,
    datevDebtorNumber: 10099,
  },
  {
    id: 'cmp-tochter',
    name: 'Muster Tochter GmbH',
    vatId: null,
    // AYNI DOMAIN, farkli tuzel kisi — domainin neden kanit olmadigi.
    email: 'buchhaltung@muster.example',
    invoiceEmail: null,
    datevDebtorNumber: null,
  },
];

const ORDERS: OrderCandidate[] = [
  { id: 'ord-1', companyId: 'cmp-muster', orderNumber: 'TA-2026-0001', externalReference: 'KD-2026-0031', status: 'confirmed' },
  { id: 'ord-2', companyId: 'cmp-nord', orderNumber: 'TA-2026-0002', externalReference: 'KD-2026-0031', status: 'draft' },
  { id: 'ord-3', companyId: 'cmp-muster', orderNumber: 'TA-2026-0003', externalReference: 'ALT-9', status: 'cancelled' },
];

// ---------------------------------------------------------------------------
// Musteri
// ---------------------------------------------------------------------------

describe('Musteri eslestirmesi — sira', () => {
  it('musteri numarasi ILK sirada', () => {
    const match = matchCompany(COMPANIES, { customerNumber: '10042', vatId: 'DE987654321' });
    assert.equal(match.status, 'customer_number');
    assert.equal(match.companyId, 'cmp-muster');
  });

  it('numara yoksa TAM VAT ID', () => {
    const match = matchCompany(COMPANIES, { vatId: 'DE 987 654 321' });
    assert.equal(match.status, 'vat_id');
    assert.equal(match.companyId, 'cmp-nord');
  });

  it('KISMI VAT eslesmesi KABUL EDILMEZ', () => {
    const match = matchCompany(COMPANIES, { vatId: 'DE12345' });
    assert.equal(match.companyId, null);
  });

  it('kayitli TAM iletisim e-postasi ucuncu sirada', () => {
    const match = matchCompany(COMPANIES, { contactEmail: 'dispo@nord.example' });
    assert.equal(match.status, 'contact_email');
    assert.equal(match.companyId, 'cmp-nord');
  });

  it('fatura e-postasi da kayitli adres sayilir', () => {
    const match = matchCompany(COMPANIES, { senderAddress: 'rechnung@muster.example' });
    assert.equal(match.status, 'contact_email');
    assert.equal(match.companyId, 'cmp-muster');
  });

  it('hicbir tanimlayici yoksa `unknown`', () => {
    const match = matchCompany(COMPANIES, {});
    assert.equal(match.status, 'unknown');
    assert.equal(match.companyId, null);
    assert.deepEqual(match.candidateIds, []);
  });
});

describe('Musteri eslestirmesi — E-POSTA DOMAINI KANIT DEGIL', () => {
  it('domain YALNIZCA aday uretir, `companyId` DOLDURULMAZ', () => {
    const match = matchCompany(COMPANIES, { senderAddress: 'einkauf@muster.example' });
    assert.equal(match.companyId, null);
    assert.equal(match.reason, 'domain_candidates_only');
    // Ayni domaini iki tuzel kisi paylasiyor.
    assert.deepEqual(match.candidateIds.sort(), ['cmp-muster', 'cmp-tochter']);
    assert.equal(match.status, 'ambiguous');
  });

  it('TEK aday olsa bile domain kesin eslesme SAYILMAZ', () => {
    const single: CompanyCandidate[] = [COMPANIES[1]!];
    const match = matchCompany(single, { senderAddress: 'einkauf@nord.example' });
    assert.equal(match.companyId, null);
    assert.equal(match.status, 'unknown');
    assert.deepEqual(match.candidateIds, ['cmp-nord']);
  });

  it('TAKLIT EDILMIS gonderen yetki URETMEZ', () => {
    // Gorunen ad "Spedition Muster GmbH" olsa bile adres kayitli degil.
    const match = matchCompany(COMPANIES, { senderAddress: 'angreifer@sahte.example' });
    assert.equal(match.companyId, null);
    assert.equal(match.status, 'unknown');
    assert.deepEqual(match.candidateIds, []);
  });
});

describe('Musteri eslestirmesi — BELIRSIZLIK', () => {
  it('ayni numarayi tasiyan iki kayit `ambiguous`', () => {
    const duplicated = [...COMPANIES, { ...COMPANIES[0]!, id: 'cmp-kopya' }];
    const match = matchCompany(duplicated, { customerNumber: '10042' });
    assert.equal(match.status, 'ambiguous');
    assert.equal(match.companyId, null);
    assert.equal(match.candidateIds.length, 2);
  });

  it('ayni VAT`i tasiyan iki kayit `ambiguous`', () => {
    const duplicated = [...COMPANIES, { ...COMPANIES[0]!, id: 'cmp-kopya', datevDebtorNumber: null }];
    const match = matchCompany(duplicated, { vatId: 'DE123456789' });
    assert.equal(match.status, 'ambiguous');
    assert.equal(match.companyId, null);
  });
});

describe('Normalizasyon', () => {
  it('VAT: bosluk, nokta ve tire onemsiz', () => {
    assert.equal(normalizeVatId('de-123.456 789'), 'DE123456789');
    assert.equal(normalizeVatId('ab'), null);
  });

  it('musteri numarasi: rakam disi karakterler atilir', () => {
    assert.equal(normalizeCustomerNumber('Nr. 10042'), 10042);
    assert.equal(normalizeCustomerNumber('bilinmiyor'), null);
  });

  it('referans: ayraclar onemsiz ama BOS referans eslesmez', () => {
    assert.equal(normalizeReference('kd 2026/0031'), 'KD20260031');
    assert.equal(normalizeReference('-'), null);
    assert.equal(normalizeReference(null), null);
  });
});

// ---------------------------------------------------------------------------
// Mevcut siparis
// ---------------------------------------------------------------------------

describe('Siparis eslestirmesi', () => {
  it('musteri + referans kesin eslesme uretir', () => {
    const match = matchExistingOrder(ORDERS, { companyId: 'cmp-muster', externalReference: 'KD-2026-0031' });
    assert.equal(match.status, 'external_reference');
    assert.equal(match.orderId, 'ord-1');
  });

  it('MUSTERI SARTI ATLANAMAZ — ayni referans baska musteride de var', () => {
    // `KD-2026-0031` hem cmp-muster hem cmp-nord'da. Musteri sabitlenmeseydi
    // bir musterinin mesajiyla digerinin siparisi degisebilirdi.
    const wrongCompany = matchExistingOrder(ORDERS, {
      companyId: 'cmp-nord',
      externalReference: 'KD-2026-0031',
    });
    assert.equal(wrongCompany.orderId, 'ord-2');

    const noCompany = matchExistingOrder(ORDERS, { companyId: null, externalReference: 'KD-2026-0031' });
    assert.equal(noCompany.orderId, null);
  });

  it('canonical siparis numarasi ikinci sirada', () => {
    const match = matchExistingOrder(ORDERS, { companyId: null, externalReference: 'TA-2026-0002' });
    assert.equal(match.status, 'order_number');
    assert.equal(match.orderId, 'ord-2');
  });

  it('IPTAL EDILMIS siparis aday DEGIL', () => {
    const match = matchExistingOrder(ORDERS, { companyId: 'cmp-muster', externalReference: 'ALT-9' });
    assert.equal(match.orderId, null);
  });

  it('musteri biliniyor ama referans yoksa ADAYLAR gosterilir, secim yapilmaz', () => {
    const match = matchExistingOrder(ORDERS, { companyId: 'cmp-muster', externalReference: null });
    assert.equal(match.status, 'unknown');
    assert.equal(match.orderId, null);
    assert.equal(match.reason, 'manual_selection_required');
    assert.deepEqual(match.candidateIds, ['ord-1']);
  });

  it('ayni musteride ayni referansli iki canli siparis `ambiguous`', () => {
    const messy = [...ORDERS, { ...ORDERS[0]!, id: 'ord-4' }];
    const match = matchExistingOrder(messy, { companyId: 'cmp-muster', externalReference: 'KD-2026-0031' });
    assert.equal(match.status, 'ambiguous');
    assert.equal(match.orderId, null);
  });
});

describe('Duplicate tespiti', () => {
  it('ayni musteri + referansta canli siparis bulunur', () => {
    assert.equal(
      findDuplicateOrder(ORDERS, { companyId: 'cmp-muster', externalReference: 'KD 2026 0031' }),
      'ord-1',
    );
  });

  it('iptal edilmis siparis referansi SERBEST birakir', () => {
    assert.equal(findDuplicateOrder(ORDERS, { companyId: 'cmp-muster', externalReference: 'ALT-9' }), null);
  });

  it('musteri ya da referans yoksa duplicate iddiasi YOK', () => {
    assert.equal(findDuplicateOrder(ORDERS, { companyId: null, externalReference: 'KD-2026-0031' }), null);
    assert.equal(findDuplicateOrder(ORDERS, { companyId: 'cmp-muster', externalReference: null }), null);
  });
});

// ---------------------------------------------------------------------------
// Niyet kurallari
// ---------------------------------------------------------------------------

const NO_COMPANY: CompanyMatch = { status: 'unknown', companyId: null, candidateIds: [], reason: 'x' };
const COMPANY: CompanyMatch = {
  status: 'customer_number',
  companyId: 'cmp-muster',
  candidateIds: ['cmp-muster'],
  reason: 'x',
};
const NO_ORDER: OrderMatch = { status: 'unknown', orderId: null, candidateIds: [], reason: 'x' };
const AMBIGUOUS_ORDER: OrderMatch = {
  status: 'ambiguous',
  orderId: null,
  candidateIds: ['ord-1', 'ord-4'],
  reason: 'x',
};
const ORDER: OrderMatch = {
  status: 'external_reference',
  orderId: 'ord-1',
  candidateIds: ['ord-1'],
  reason: 'x',
};

describe('Niyet kurallari — yeni siparis', () => {
  it('duplicate YOKSA duz gecer', () => {
    const decision = resolveIntentDecision({
      proposedIntent: 'new_order',
      companyMatch: COMPANY,
      orderMatch: NO_ORDER,
    });
    assert.equal(decision.intent, 'new_order');
    assert.equal(decision.possibleDuplicate, false);
  });

  it('AYNI musteri + referans varsa SESSIZCE ikinci siparis ACILMAZ', () => {
    const decision = resolveIntentDecision({
      proposedIntent: 'new_order',
      companyMatch: COMPANY,
      orderMatch: NO_ORDER,
      duplicateOrderId: 'ord-1',
    });
    assert.equal(decision.possibleDuplicate, true);
    assert.equal(decision.duplicateOfOrderId, 'ord-1');
    // Niyet YINE `new_order`: insan "evet, gercekten ikinci siparis"
    // diyebilmeli — karar bizim degil, ama isaret gorunur.
    assert.equal(decision.intent, 'new_order');
    assert.equal(decision.reason, 'duplicate_reference_for_customer');
  });

  it('musteri cozulemese bile yeni siparis niyeti korunur', () => {
    const decision = resolveIntentDecision({
      proposedIntent: 'new_order',
      companyMatch: NO_COMPANY,
      orderMatch: NO_ORDER,
    });
    assert.equal(decision.intent, 'new_order');
    assert.equal(decision.reason, 'new_order_customer_unresolved');
  });
});

describe('Niyet kurallari — degisiklik ve iptal MEVCUT SIPARIS ISTER', () => {
  for (const intent of ['amendment', 'cancellation'] as const) {
    it(`${intent}: siparis KESIN eslesmediyse kullanici SECMEDEN ilerlenemez`, () => {
      const decision = resolveIntentDecision({
        proposedIntent: intent,
        companyMatch: COMPANY,
        orderMatch: NO_ORDER,
      });
      assert.equal(decision.requiresOrderSelection, true);
      assert.equal(decision.reason, 'order_not_identified');
    });

    it(`${intent}: BELIRSIZ eslesmede de secim zorunlu`, () => {
      const decision = resolveIntentDecision({
        proposedIntent: intent,
        companyMatch: COMPANY,
        orderMatch: AMBIGUOUS_ORDER,
      });
      assert.equal(decision.requiresOrderSelection, true);
      assert.equal(decision.reason, 'ambiguous_order_match');
    });

    it(`${intent}: kesin eslesmede ilerleyebilir`, () => {
      const decision = resolveIntentDecision({
        proposedIntent: intent,
        companyMatch: COMPANY,
        orderMatch: ORDER,
      });
      assert.equal(decision.requiresOrderSelection, false);
      assert.equal(decision.intent, intent);
    });
  }
});

describe('Niyet kurallari — bilinmeyen', () => {
  it('`unknown` OLDUGU GIBI kalir ve `new_order`a DUSMEZ', () => {
    const decision = resolveIntentDecision({
      proposedIntent: 'unknown',
      companyMatch: COMPANY,
      orderMatch: ORDER,
    });
    assert.equal(decision.intent, 'unknown');
    assert.equal(decision.requiresOrderSelection, false);
    assert.equal(decision.reason, 'agent_reported_unknown');
  });
});

describe('Sozlesme sinirlari', () => {
  it('karar islevi HICBIR kayda dokunmaz — saf ve girdisi dar', () => {
    // Girdi yalnizca eslestirme sonuclari; gonderen adresi ya da thread
    // bilgisi BURAYA HIC GELMIYOR — dolayisiyla yetki de uretemez.
    const decision = resolveIntentDecision({
      proposedIntent: 'amendment',
      companyMatch: COMPANY,
      orderMatch: ORDER,
    });
    assert.deepEqual(Object.keys(decision).sort(), [
      'duplicateOfOrderId',
      'intent',
      'possibleDuplicate',
      'reason',
      'requiresOrderSelection',
    ]);
  });
});
