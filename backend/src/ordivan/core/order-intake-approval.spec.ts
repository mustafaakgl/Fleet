import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FINANCIAL_REVIEW_SEQUENCE,
  OPERATIONAL_REVIEW_SEQUENCE,
  assessApproval,
  diffCorrections,
  planReviewTasks,
} from './order-intake-approval';

/** Onay on kosullari ve 1:n gorev plani (Faz 16, bolum 6-7). */

const BASE = {
  reviewStatus: 'open',
  intent: 'new_order',
  companyId: 'cmp-1',
  orderId: null as string | null,
  operationalDecided: true,
  financialRequired: false,
  financialDecided: false,
  alreadyProduced: false,
};

describe('Inceleme gorevleri — 1:n', () => {
  it('operasyonel gorev DAIMA aciliyor', () => {
    const tasks = planReviewTasks({ hasRevenue: false, containsFinancialData: 'no' });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]!.sequence, OPERATIONAL_REVIEW_SEQUENCE);
    assert.equal(tasks[0]!.assignedRole, 'office');
  });

  it('TUTAR YOKSA gereksiz finans adimi ACILMIYOR', () => {
    const tasks = planReviewTasks({ hasRevenue: false, containsFinancialData: 'no' });
    assert.equal(tasks.some((task) => task.sequence === FINANCIAL_REVIEW_SEQUENCE), false);
  });

  it('tutar varsa finansal gorev aciliyor', () => {
    const tasks = planReviewTasks({ hasRevenue: true, containsFinancialData: 'no' });
    const financial = tasks.find((task) => task.sequence === FINANCIAL_REVIEW_SEQUENCE);
    assert.equal(financial?.assignedRole, 'accounting');
    assert.equal(financial?.required, true);
  });

  it('belge finansal veri tasiyorsa tutar okunamamis olsa da aciliyor', () => {
    const tasks = planReviewTasks({ hasRevenue: false, containsFinancialData: 'yes' });
    assert.equal(tasks.length, 2);
  });

  it('`unknown` GEREKLI SAYILIYOR — fiyat yok VARSAYILMIYOR', () => {
    const tasks = planReviewTasks({ hasRevenue: false, containsFinancialData: 'unknown' });
    assert.equal(tasks.length, 2);
  });
});

describe('Onay on kosullari', () => {
  it('butun kosullar saglandiginda izin veriliyor', () => {
    assert.deepEqual(assessApproval(BASE), { allowed: true, blockedBy: [] });
  });

  it('`unknown` niyet ONAYLANAMAZ', () => {
    const result = assessApproval({ ...BASE, intent: 'unknown' });
    assert.equal(result.allowed, false);
    assert.ok(result.blockedBy.includes('intent_unknown'));
  });

  it('yeni siparis MUSTERI secilmeden acilamaz', () => {
    const result = assessApproval({ ...BASE, companyId: null });
    assert.ok(result.blockedBy.includes('company_not_selected'));
  });

  for (const intent of ['amendment', 'cancellation']) {
    it(`${intent}: SIPARIS secilmeden ilerlenemez`, () => {
      const result = assessApproval({ ...BASE, intent, orderId: null });
      assert.ok(result.blockedBy.includes('order_not_selected'));
    });

    it(`${intent}: siparis secilince ilerleyebilir`, () => {
      const result = assessApproval({ ...BASE, intent, orderId: 'ord-1' });
      assert.equal(result.allowed, true);
    });
  }

  it('ZORUNLU GOREV bitmeden taslak olusmaz', () => {
    const operational = assessApproval({ ...BASE, operationalDecided: false });
    assert.ok(operational.blockedBy.includes('operational_review_pending'));

    const financial = assessApproval({ ...BASE, financialRequired: true, financialDecided: false });
    assert.ok(financial.blockedBy.includes('financial_review_pending'));
  });

  it('finans gerekmiyorsa karar verilmemis olmasi ENGEL DEGIL', () => {
    const result = assessApproval({ ...BASE, financialRequired: false, financialDecided: false });
    assert.equal(result.allowed, true);
  });

  it('EXACTLY-ONCE: sonuc uretilmisse ikinci onay engelleniyor', () => {
    const result = assessApproval({ ...BASE, alreadyProduced: true });
    assert.equal(result.allowed, false);
    assert.ok(result.blockedBy.includes('already_produced_result'));
  });

  it('kapanmis inceleme yeniden onaylanamaz', () => {
    const result = assessApproval({ ...BASE, reviewStatus: 'approved' });
    assert.ok(result.blockedBy.includes('review_not_open'));
  });

  it('birden fazla engel HEPSI birden bildiriliyor', () => {
    const result = assessApproval({
      ...BASE,
      intent: 'amendment',
      orderId: null,
      operationalDecided: false,
    });
    assert.equal(result.blockedBy.length, 2);
  });
});

describe('Duzeltme olaylari — DEGER TASIMIYOR', () => {
  it('degismeyen alan `accepted_as_is`', () => {
    const corrections = diffCorrections({ customerName: 'Muster' }, { customerName: 'Muster' });
    assert.deepEqual(corrections, [
      { fieldName: 'customerName', fieldType: 'string', changed: false, category: 'accepted_as_is' },
    ]);
  });

  it('degistirilen alan `value_corrected`', () => {
    const corrections = diffCorrections({ customerName: 'Muster' }, { customerName: 'Nord' });
    assert.equal(corrections[0]!.category, 'value_corrected');
    assert.equal(corrections[0]!.changed, true);
  });

  it('insanin ekledigi alan `field_added`, kaldirdigi `field_removed`', () => {
    assert.equal(diffCorrections({}, { currency: 'EUR' })[0]!.category, 'field_added');
    assert.equal(diffCorrections({ currency: 'EUR' }, {})[0]!.category, 'field_removed');
  });

  it('cikti HICBIR DEGER tasimiyor — yalnizca ad, tur ve kategori', () => {
    const corrections = diffCorrections(
      { revenueAmount: 1250, customerName: 'Gizli GmbH' },
      { revenueAmount: 9999, customerName: 'Gizli GmbH' },
    );
    const serialized = JSON.stringify(corrections);
    assert.equal(serialized.includes('1250'), false);
    assert.equal(serialized.includes('9999'), false);
    assert.equal(serialized.includes('Gizli'), false);
  });

  it('bos alanlar gurultu URETMIYOR', () => {
    assert.deepEqual(diffCorrections({ notes: null }, { notes: undefined }), []);
  });
});
