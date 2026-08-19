import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DOCUMENT_TYPE_REGISTRY,
  canRoleRoute,
  resolveDocumentType,
} from './document-type-registry';
import {
  FORBIDDEN_TOOLS,
  JOB_TYPE_REGISTRY,
  knownCapabilities,
  sanitizeCapabilities,
  validateJobPayload,
  validateProposal,
} from './job-type-registry';
import { SchemaValidationError } from './schema-validation';

/**
 * FAZ 16 — CIKARIM SOZLESMESI (bolum 2 ve 4).
 *
 * Bu dosya bir "mutluluk yolu" testi degil: burada olculen sey, GUVENSIZ bir
 * kaynagin (e-posta govdesi, PDF metni, connector yaniti) sozlesmenin
 * disina cikamamasi. Her `assert.throws` bir saldiri denemesinin karsiligi.
 */

const JOB = 'transport_order.extract';
const PROPOSAL = 'transport_order.extraction';

/** Sozlesmeye UYAN en kucuk gecerli govde — testlerin ortak taban tasi. */
function minimalPayload(): Record<string, unknown> {
  return { intent: 'new_order' };
}

function consignment(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { adr: 'unknown', ...extra };
}

describe('Faz 16 — yetenek ve is turu kaydi', () => {
  it('yetenek SURUMLU ve taninan yetenekler arasinda', () => {
    assert.equal(JOB_TYPE_REGISTRY[JOB].requiredCapability, 'transport_order.extract@v1');
    assert.ok(knownCapabilities().has('transport_order.extract@v1'));
  });

  it('surumsuz yetenek adi TANINMAZ — eski connector sessizce yeni davranisa GECMEZ', () => {
    assert.deepEqual(sanitizeCapabilities(['transport_order.extract']), []);
    assert.deepEqual(sanitizeCapabilities(['transport_order.extract@v1']), [
      'transport_order.extract@v1',
    ]);
  });

  it('connector kendi istegiyle yetenek UYDURAMAZ', () => {
    assert.deepEqual(sanitizeCapabilities(['transport_order.extract@v2', 'sql', 'http']), []);
  });

  it('is turunun ARAC SETI BOS — musteri/siparis eslestirmesi sunucuda', () => {
    assert.deepEqual([...JOB_TYPE_REGISTRY[JOB].toolset], []);
  });

  it('genel araclarin hicbiri bu is turune verilmemis', () => {
    for (const tool of FORBIDDEN_TOOLS) {
      assert.ok(!JOB_TYPE_REGISTRY[JOB].toolset.includes(tool), `${tool} verilmis`);
    }
  });

  it('is yalnizca KENDI oneri turunu uretebilir', () => {
    assert.deepEqual([...JOB_TYPE_REGISTRY[JOB].allowedProposalTypes], [PROPOSAL]);
    assert.throws(
      () => validateProposal(JOB, 'service_invoice.draft', 1, { vendorName: 'X' }),
      (error: unknown) =>
        error instanceof SchemaValidationError &&
        error.reason === 'proposal_type_not_allowed_for_job',
    );
  });

  it('cikarim onerisi BASKA bir isten URETILEMEZ', () => {
    assert.throws(
      () => validateProposal('system.echo', PROPOSAL, 1, minimalPayload()),
      (error: unknown) =>
        error instanceof SchemaValidationError &&
        error.reason === 'proposal_type_not_allowed_for_job',
    );
  });
});

describe('Faz 16 — is payload`i belge ICERIGI TASIMAZ', () => {
  it('mesaj KIMLIGI kabul edilir', () => {
    const result = validateJobPayload(JOB, 1, {
      messageId: 'msg-1',
      attachmentIntakeIds: [{ id: 'intake-1' }],
    });
    assert.deepEqual(result, { messageId: 'msg-1', attachmentIntakeIds: [{ id: 'intake-1' }] });
  });

  it('e-posta GOVDESI/konusu is kaydina giremez — kuyruk kaydi loglara sizar', () => {
    for (const field of ['body', 'bodyText', 'subject', 'rawEml', 'text']) {
      assert.throws(
        () => validateJobPayload(JOB, 1, { messageId: 'msg-1', [field]: 'guvensiz metin' }),
        (error: unknown) =>
          error instanceof SchemaValidationError && error.reason === 'unexpected_field',
        `${field} kabul edilmis`,
      );
    }
  });

  it('desteklenmeyen sema surumu REDDEDILIR', () => {
    assert.throws(
      () => validateJobPayload(JOB, 2, { messageId: 'msg-1' }),
      (error: unknown) =>
        error instanceof SchemaValidationError && error.reason === 'unsupported_schema_version',
    );
  });
});

describe('Faz 16 — cikarim sozlesmesi: NIYET', () => {
  it('niyet ZORUNLU — bos birakilan mesaj bir varsayilana DUSMEZ', () => {
    assert.throws(
      () => validateProposal(JOB, PROPOSAL, 1, {}),
      (error: unknown) =>
        error instanceof SchemaValidationError && error.reason === 'missing_required_field',
    );
  });

  it('`unknown` GECERLI bir cevap — model "anlamadim" diyebilmeli', () => {
    const result = validateProposal(JOB, PROPOSAL, 1, { intent: 'unknown' });
    assert.equal(result.intent, 'unknown');
  });

  it('dort niyet disinda bir deger REDDEDILIR', () => {
    for (const intent of ['approve', 'confirm', 'delete', 'new order', 'NEW_ORDER']) {
      assert.throws(
        () => validateProposal(JOB, PROPOSAL, 1, { intent }),
        (error: unknown) =>
          error instanceof SchemaValidationError && error.reason === 'not_in_enum',
        `${intent} kabul edilmis`,
      );
    }
  });
});

describe('Faz 16 — YASAK ALANLAR: ajan Fleet`in ic kimliklerini yazamaz', () => {
  /**
   * Bu liste sozlesmede SAYILMADIGI icin reddediliyor — ayri bir kara liste
   * yok. Test, listenin sessizce genislemesini yakalamak icin var: birisi
   * `vehicleId`i semaya eklerse burasi kirilir.
   */
  const FORBIDDEN_FIELDS: Record<string, unknown> = {
    companyId: 'cmp-1',
    customerId: 'cmp-1',
    vehicleId: 'veh-1',
    driverId: 'drv-1',
    assignmentId: 'asg-1',
    consignmentId: 'con-1',
    transportOrderId: 'ord-1',
    tenantId: 'other-tenant',
    orderNumber: 'TA-2026-0001',
    status: 'confirmed',
    approved: true,
    confirmed: true,
    cancelled: true,
    approvalDecision: 'approved',
    latitude: 51.4,
    longitude: 6.7,
  };

  for (const [field, value] of Object.entries(FORBIDDEN_FIELDS)) {
    it(`\`${field}\` ajan payload'indan KABUL EDILMEZ`, () => {
      assert.throws(
        () => validateProposal(JOB, PROPOSAL, 1, { ...minimalPayload(), [field]: value }),
        (error: unknown) =>
          error instanceof SchemaValidationError &&
          error.reason === 'unexpected_field' &&
          error.field === field,
      );
    });
  }

  it('koordinat KALEM ICINDE de reddedilir — dizinin ici ayni kurallardan gecer', () => {
    assert.throws(
      () =>
        validateProposal(JOB, PROPOSAL, 1, {
          ...minimalPayload(),
          consignments: [consignment({ latitude: 51.4 })],
        }),
      (error: unknown) =>
        error instanceof SchemaValidationError && error.reason === 'unexpected_field',
    );
  });

  it('prototype kirletme denemesi ayri bir sinif olarak reddedilir', () => {
    assert.throws(
      () =>
        validateProposal(JOB, PROPOSAL, 1, JSON.parse('{"intent":"new_order","__proto__":{"a":1}}')),
      (error: unknown) =>
        error instanceof SchemaValidationError && error.reason === 'forbidden_key',
    );
  });
});

describe('Faz 16 — UYDURMA YOK: eksik alan varsayilana dusmez', () => {
  it('para birimi verilmediyse cikti da BOS — EUR varsayilmaz', () => {
    const result = validateProposal(JOB, PROPOSAL, 1, {
      ...minimalPayload(),
      revenueAmount: 1250,
    });
    assert.equal(result.currency, undefined);
    assert.ok(!('currency' in result));
  });

  it('zaman dilimi verilmediyse cikti da BOS — saat bir dilime VARSAYILMAZ', () => {
    const result = validateProposal(JOB, PROPOSAL, 1, {
      ...minimalPayload(),
      consignments: [consignment({ pickupWindowStart: '2026-09-01T08:00' })],
    });
    const first = (result.consignments as Array<Record<string, unknown>>)[0]!;
    assert.equal(first.pickupWindowStart, '2026-09-01T08:00');
    assert.ok(!('timezone' in first));
  });

  it('ADR ZORUNLU — belirtilmeyen kalem sessizce `no` gibi islem GORMEZ', () => {
    assert.throws(
      () =>
        validateProposal(JOB, PROPOSAL, 1, {
          ...minimalPayload(),
          consignments: [{ cargoDescription: 'Palette' }],
        }),
      (error: unknown) =>
        error instanceof SchemaValidationError &&
        error.reason === 'missing_required_field' &&
        error.field === 'consignments[0]',
    );
  });

  it('ADR `unknown` GECERLI — "bilmiyorum" durust bir cevap', () => {
    const result = validateProposal(JOB, PROPOSAL, 1, {
      ...minimalPayload(),
      consignments: [consignment()],
    });
    assert.equal((result.consignments as Array<Record<string, unknown>>)[0]!.adr, 'unknown');
  });

  it('sayi yerine metin gonderilen tutar SESSIZCE cevrilmez', () => {
    assert.throws(
      () => validateProposal(JOB, PROPOSAL, 1, { ...minimalPayload(), revenueAmount: '1250' }),
      (error: unknown) =>
        error instanceof SchemaValidationError && error.reason === 'wrong_type',
    );
  });

  it('sinirsiz kalem listesi REDDEDILIR', () => {
    assert.throws(
      () =>
        validateProposal(JOB, PROPOSAL, 1, {
          ...minimalPayload(),
          consignments: Array.from({ length: 21 }, () => consignment()),
        }),
      (error: unknown) =>
        error instanceof SchemaValidationError && error.reason === 'too_many_items',
    );
  });

  it('BIRDEN FAZLA kalem tasinabilir — iki bosaltmali siparis tek noktaya inmez', () => {
    const result = validateProposal(JOB, PROPOSAL, 1, {
      ...minimalPayload(),
      consignments: [
        consignment({ deliveryAddress: 'Hamburg' }),
        consignment({ deliveryAddress: 'Berlin' }),
      ],
    });
    assert.equal((result.consignments as unknown[]).length, 2);
  });
});

describe('Faz 16 — belge turu kaydi', () => {
  it('tasima emri KAYITLI ve hedefi bir INCELEME', () => {
    const definition = resolveDocumentType('transport_order@v1');
    assert.equal(definition.destination, 'ordivan.transport_order');
    assert.equal(definition.family, 'transport_order');
  });

  it('surumsuz anahtar `unknown`a DUSMEZ — yazim hatasi ile "bilmiyorum" ayni sey degil', () => {
    assert.throws(
      () => resolveDocumentType('transport_order'),
      (error: unknown) =>
        error instanceof SchemaValidationError && error.reason === 'unknown_document_type_key',
    );
  });

  it('SURUCU ve MUSTERI bu turu yonlendiremez', () => {
    for (const role of ['driver', 'customer', 'accounting', null, undefined, '']) {
      assert.equal(canRoleRoute('transport_order@v1', role), false, `${role} gecmis`);
    }
  });

  it('operasyon yazma rolleri yonlendirebilir', () => {
    for (const role of ['admin', 'boss', 'office']) {
      assert.equal(canRoleRoute('transport_order@v1', role), true, `${role} engellenmis`);
    }
  });

  it('tur bir ARACA baglanmak zorunda DEGIL', () => {
    assert.equal(DOCUMENT_TYPE_REGISTRY['transport_order@v1'].requiresVehicle, false);
  });
});
