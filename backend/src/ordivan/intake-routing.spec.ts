import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IntakeRoutingService } from './intake-routing.service';

type Row = Record<string, unknown>;

/**
 * YONLENDIRME (Faz 14).
 *
 * Prisma MOCK ama TEKILLIGI GERCEKTEN uyguluyor: `intakeDocumentId` uzerindeki
 * unique kisit taklit edilmeseydi, "tekrarlanan onay ikinci kayit uretmiyor"
 * testi hicbir sey kanitlamazdi — asil kural zaten veritabaninda.
 */

const DATE_VERIFIED = [
  { code: 'document_date_present', status: 'verified', messageKey: 'x' },
];
const DATE_UNKNOWN = [
  { code: 'document_date_present', status: 'unknown', messageKey: 'x', unknownReason: 'no_parsable_date' },
];

interface BuildOptions {
  typeKey?: string;
  subtype?: string | null;
  vehicleId?: string | null;
  driverId?: string | null;
  vehicleMatchStatus?: 'verified' | 'failed' | 'unknown';
  checks?: unknown[];
  routed?: boolean;
}

function build(options: BuildOptions = {}) {
  const documents: Row[] = [
    {
      id: 'doc-1',
      intakeId: 'intake-1',
      typeKey: options.typeKey ?? 'service_invoice@v1',
      subtype: options.subtype ?? null,
      status: 'needs_review',
      pageFrom: 1,
      pageTo: 1,
      vehicleId: options.vehicleId === undefined ? 'veh-1' : options.vehicleId,
      vehicleMatchStatus: options.vehicleMatchStatus ?? 'verified',
      driverId: options.driverId ?? null,
      candidates: { plateNumbers: [], vins: [], dates: [], amounts: [] },
      checks: options.checks ?? DATE_VERIFIED,
      domainReviewReason: null,
      decidedById: null,
      decidedAt: null,
    },
  ];
  const routings: Row[] = options.routed
    ? [
        {
          id: 'routing-0',
          intakeDocumentId: 'doc-1',
          destination: 'ordivan.service_invoice',
          entityType: 'AutomationJob',
          entityId: 'job-existing',
          secondaryEntityType: null,
          secondaryEntityId: null,
        },
      ]
    : [];
  const fuelEntries: Row[] = [];
  const vehicleDocuments: Row[] = [];
  const reminders: Row[] = [];
  const fines: Row[] = [];
  const intakes: Row[] = [{ id: 'intake-1', status: 'needs_review' }];
  const audits: Row[] = [];
  const createdJobs: Row[] = [];
  let seq = 0;

  const matches = (row: Row, where: Record<string, unknown> | undefined): boolean => {
    if (!where) return true;
    for (const [key, expected] of Object.entries(where)) {
      if (key === 'tenantId') continue;
      const actual = row[key];
      if (expected !== null && typeof expected === 'object') {
        const spec = expected as { in?: unknown[]; not?: unknown };
        if (spec.in && !spec.in.includes(actual)) return false;
        if ('not' in spec && actual === spec.not) return false;
        continue;
      }
      if (actual !== expected) return false;
    }
    return true;
  };

  const table = (store: Row[], prefix: string, uniqueBy?: string) => ({
    create: async (args: { data: Row }) => {
      // TEKILLIK GERCEKTEN uygulaniyor: yaris testinin anlamli olmasi icin sart.
      if (uniqueBy && store.some((row) => row[uniqueBy] === args.data[uniqueBy])) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      seq += 1;
      const row: Row = { id: `${prefix}-${seq}`, tenantId: 'tenant-a', ...args.data };
      store.push(row);
      return { ...row };
    },
    findFirst: async (args: { where?: Record<string, unknown> }) => {
      const found = store.find((row) => matches(row, args.where));
      return found ? { ...found } : null;
    },
    updateMany: async (args: { where?: Record<string, unknown>; data: Row }) => {
      let count = 0;
      for (const row of store) {
        if (matches(row, args.where)) {
          Object.assign(row, args.data);
          count += 1;
        }
      }
      return { count };
    },
    count: async (args: { where?: Record<string, unknown> } = {}) =>
      store.filter((row) => matches(row, args.where)).length,
  });

  const client = {
    intakeDocument: {
      ...table(documents, 'doc'),
      findFirst: async (args: { where?: Record<string, unknown> }) => {
        const found = documents.find((row) => matches(row, args.where));
        if (!found) return null;
        const routing = routings.find((item) => item.intakeDocumentId === found.id) ?? null;
        return {
          ...found,
          routing: routing ? { id: routing.id } : null,
          intake: {
            id: 'intake-1',
            pageCount: 1,
            artifact: {
              id: 'artifact-1',
              originalName: 'scan.pdf',
              mimeType: 'application/pdf',
              fileSize: 1234,
            },
          },
        };
      },
    },
    intakeDocumentRouting: table(routings, 'routing', 'intakeDocumentId'),
    fleetFuelEntry: table(fuelEntries, 'fuel'),
    document: table(vehicleDocuments, 'vdoc'),
    reminder: table(reminders, 'rem'),
    fine: table(fines, 'fine'),
    documentIntake: table(intakes, 'intake'),
  };

  const prisma = {
    ...client,
    unscoped: client,
    // Gercek transaction: create icinde firlarsa DIS taraf yakalar. Tekillik
    // ihlalinde domain kaydini GERI ALMAK icin store'lari isaretliyoruz.
    $transaction: async <T>(fn: (tx: typeof client) => Promise<T>): Promise<T> => {
      const snapshots = [fuelEntries, vehicleDocuments, reminders, fines].map(
        (store) => [store, store.length] as const,
      );
      try {
        return await fn(client);
      } catch (error) {
        // ROLLBACK taklidi: yaris kaybedenin domain kaydi da yok olmali.
        for (const [store, length] of snapshots) {
          store.length = length;
        }
        throw error;
      }
    },
  };

  const audit = {
    logAction: async (entry: Row) => {
      audits.push(entry);
      return {};
    },
  };
  const intake = {
    loadForRouting: (id: string) => client.intakeDocument.findFirst({ where: { id } }),
    settleIntakeOf: async () => undefined,
  };
  const jobs = {
    createJob: async (_userId: string, input: Row) => {
      seq += 1;
      const job = { id: `job-${seq}`, ...input };
      createdJobs.push(job);
      return job;
    },
  };

  const service = new IntakeRoutingService(
    prisma as never,
    audit as never,
    intake as never,
    jobs as never,
  );
  return {
    service,
    documents,
    routings,
    fuelEntries,
    vehicleDocuments,
    reminders,
    fines,
    audits,
    createdJobs,
  };
}

// ---------------------------------------------------------------------------

describe('Yonlendirme — servis faturasi Faz 13 akisina', () => {
  it('DOSYA IKINCI KEZ YUKLENMEZ — is ayni artifact\'e baglanir', async () => {
    const ctx = build({ typeKey: 'service_invoice@v1' });
    const result = await ctx.service.route('user-boss', 'boss', 'doc-1', {});

    assert.equal(result.entityType, 'AutomationJob');
    assert.equal(ctx.createdJobs.length, 1);
    const job = ctx.createdJobs[0]!;
    assert.equal(job.documentId, 'artifact-1');
    assert.equal((job.payload as Row).documentId, 'artifact-1');
  });

  it('gelen kutusu ServiceRecord URETMEZ — Faz 13\'un onayi yerinde kalir', async () => {
    const ctx = build({ typeKey: 'service_invoice@v1' });
    await ctx.service.route('user-boss', 'boss', 'doc-1', {});
    // Maliyet satiri BURADA olusmuyor; oneri/onay dongusu Faz 13'te.
    assert.equal(ctx.fuelEntries.length, 0);
    assert.equal(ctx.fines.length, 0);
  });

  it('office servis faturasini yonlendiremez', async () => {
    const ctx = build({ typeKey: 'service_invoice@v1' });
    await assert.rejects(
      ctx.service.route('user-office', 'office', 'doc-1', {}),
      ForbiddenException,
    );
    assert.equal(ctx.routings.length, 0);
  });
});

describe('Yonlendirme — yakit fisi muhasebe incelemesine', () => {
  const confirmation = {
    enteredAt: '2026-08-15T10:00:00.000Z',
    liters: 52.3,
    totalCost: 91.5,
    currency: 'EUR',
  };

  it('ONAYLANMIS GIDER OLUSTURMAZ — `submitted` durumunda kalir', async () => {
    const ctx = build({ typeKey: 'fuel_receipt@v1', driverId: 'drv-1' });
    await ctx.service.route('user-acc', 'accounting', 'doc-1', { fuelReceipt: confirmation });

    assert.equal(ctx.fuelEntries.length, 1);
    const entry = ctx.fuelEntries[0]!;
    // `approved` RAPORLARA GIREN TEK DURUM ve buraya asla yazilmiyor.
    assert.equal(entry.workflowStatus, 'submitted');
    assert.notEqual(entry.workflowStatus, 'approved');
    assert.equal(entry.reviewedById, undefined);
  });

  it('SURUCU YOKSA canonical kayit acilmaz — belge domain incelemesinde bekler', async () => {
    const ctx = build({ typeKey: 'fuel_receipt@v1', driverId: null });
    await assert.rejects(
      ctx.service.route('user-acc', 'accounting', 'doc-1', { fuelReceipt: confirmation }),
      ConflictException,
    );
    assert.equal(ctx.fuelEntries.length, 0);
    // PARALEL MODEL UYDURULMADI: belge bekliyor ve sebebi raporda.
    assert.equal(ctx.documents[0]!.status, 'needs_domain_review');
    assert.equal(ctx.documents[0]!.domainReviewReason, 'driver_required');
  });

  it('office yakit fisini yonlendiremez', async () => {
    const ctx = build({ typeKey: 'fuel_receipt@v1', driverId: 'drv-1' });
    await assert.rejects(
      ctx.service.route('user-office', 'office', 'doc-1', { fuelReceipt: confirmation }),
      ForbiddenException,
    );
  });

  it('para birimi EUR VARSAYILMAZ', async () => {
    const ctx = build({ typeKey: 'fuel_receipt@v1', driverId: 'drv-1' });
    await assert.rejects(
      ctx.service.route('user-acc', 'accounting', 'doc-1', {
        fuelReceipt: { ...confirmation, currency: '' },
      }),
      BadRequestException,
    );
    assert.equal(ctx.fuelEntries.length, 0);
  });

  it('onay nesnesi olmadan kayit acilmaz', async () => {
    const ctx = build({ typeKey: 'fuel_receipt@v1', driverId: 'drv-1' });
    await assert.rejects(
      ctx.service.route('user-acc', 'accounting', 'doc-1', {}),
      BadRequestException,
    );
  });
});

describe('Yonlendirme — TUV/SP ve sigorta', () => {
  it('arac belgesi olusur; hatirlatma ISTENMEDIKCE olusmaz', async () => {
    const ctx = build({ typeKey: 'vehicle_inspection@v1', subtype: 'tuv' });
    const result = await ctx.service.route('user-office', 'office', 'doc-1', {
      vehicleDocument: { documentType: 'HU-Bericht', expiryDate: '2027-09-04' },
    });

    assert.equal(result.entityType, 'Document');
    assert.equal(ctx.vehicleDocuments.length, 1);
    // Varsayilan HAYIR.
    assert.equal(ctx.reminders.length, 0);
    assert.equal(result.secondaryEntityId, null);
  });

  it('kullanici acikca isterse ve tarih GUVENILIRSE hatirlatma taslagi olusur', async () => {
    const ctx = build({ typeKey: 'vehicle_inspection@v1', subtype: 'tuv', checks: DATE_VERIFIED });
    const result = await ctx.service.route('user-office', 'office', 'doc-1', {
      vehicleDocument: {
        documentType: 'HU-Bericht',
        expiryDate: '2027-09-04',
        createReminder: true,
        notifyBeforeDays: 30,
      },
    });

    assert.equal(ctx.reminders.length, 1);
    assert.equal(ctx.reminders[0]!.reminderType, 'tuv_expiry');
    assert.equal(result.secondaryEntityType, 'Reminder');
  });

  it('SP raporu `sp_expiry` hatirlatmasi kurar', async () => {
    const ctx = build({ typeKey: 'vehicle_inspection@v1', subtype: 'sp' });
    await ctx.service.route('user-office', 'office', 'doc-1', {
      vehicleDocument: { documentType: 'SP-Bericht', expiryDate: '2027-03-01', createReminder: true },
    });
    assert.equal(ctx.reminders[0]!.reminderType, 'sp_expiry');
  });

  it('sigorta `insurance_expiry` hatirlatmasi kurar', async () => {
    const ctx = build({ typeKey: 'vehicle_insurance@v1' });
    await ctx.service.route('user-office', 'office', 'doc-1', {
      vehicleDocument: { documentType: 'Versicherungsschein', expiryDate: '2027-01-01', createReminder: true },
    });
    assert.equal(ctx.reminders[0]!.reminderType, 'insurance_expiry');
  });

  it('TARIH GUVENILIR DEGILSE hatirlatma REDDEDILIR — kullanici istese bile', async () => {
    const ctx = build({ typeKey: 'vehicle_inspection@v1', subtype: 'tuv', checks: DATE_UNKNOWN });
    await assert.rejects(
      ctx.service.route('user-office', 'office', 'doc-1', {
        vehicleDocument: { documentType: 'HU', expiryDate: '2027-09-04', createReminder: true },
      }),
      BadRequestException,
    );
    assert.equal(ctx.reminders.length, 0);
    assert.equal(ctx.vehicleDocuments.length, 0);
  });

  it('alt turu `unknown` olan muayenede hatirlatma KURULMAZ', async () => {
    const ctx = build({ typeKey: 'vehicle_inspection@v1', subtype: 'unknown' });
    const result = await ctx.service.route('user-office', 'office', 'doc-1', {
      vehicleDocument: { documentType: 'Bericht', expiryDate: '2027-09-04', createReminder: true },
    });
    // Belge olusuyor ama hangi sureye hatirlatma kuracagimizi BILMIYORUZ.
    assert.equal(ctx.vehicleDocuments.length, 1);
    assert.equal(ctx.reminders.length, 0);
    assert.equal(result.secondaryEntityId, null);
  });
});

describe('Yonlendirme — trafik cezasi', () => {
  const fine = {
    violationAt: '2026-07-11T08:15:00.000Z',
    violationLocation: 'A40 Essen',
    violationType: 'Geschwindigkeit',
    violationCategory: 'speed' as const,
    amount: 60,
  };

  it('yazma yetkisi olan rol canonical kaydi acar', async () => {
    const ctx = build({ typeKey: 'traffic_fine@v1' });
    const result = await ctx.service.route('user-office', 'office', 'doc-1', { fine });
    assert.equal(result.entityType, 'Fine');
    assert.equal(ctx.fines.length, 1);
    assert.equal(ctx.fines[0]!.status, 'neu');
  });

  it('MUHASEBE ceza olusturamaz — fines guard\'i gevsetilmedi', async () => {
    const ctx = build({ typeKey: 'traffic_fine@v1' });
    await assert.rejects(
      ctx.service.route('user-acc', 'accounting', 'doc-1', { fine }),
      ForbiddenException,
    );
    assert.equal(ctx.fines.length, 0);
  });

  it('ACIK onay olmadan ceza olusmaz', async () => {
    const ctx = build({ typeKey: 'traffic_fine@v1' });
    await assert.rejects(
      ctx.service.route('user-office', 'office', 'doc-1', {}),
      BadRequestException,
    );
    assert.equal(ctx.fines.length, 0);
  });

  it('degerler BELGEDEN degil INSANDAN gelir — eksik alan reddedilir', async () => {
    const ctx = build({ typeKey: 'traffic_fine@v1' });
    await assert.rejects(
      ctx.service.route('user-office', 'office', 'doc-1', {
        fine: { ...fine, violationLocation: '   ' },
      }),
      BadRequestException,
    );
  });
});

describe('Yonlendirme — unknown ve eksik arac', () => {
  it('`unknown` tur KAYIT URETEMEZ', async () => {
    const ctx = build({ typeKey: 'unknown@v1' });
    await assert.rejects(
      ctx.service.route('user-admin', 'admin', 'doc-1', {}),
      BadRequestException,
    );
    assert.equal(ctx.routings.length, 0);
  });

  it('arac secilmemisse domain incelemesine duser', async () => {
    const ctx = build({ typeKey: 'traffic_fine@v1', vehicleId: null, vehicleMatchStatus: 'unknown' });
    await assert.rejects(
      ctx.service.route('user-office', 'office', 'doc-1', {
        fine: {
          violationAt: '2026-07-11T08:15:00.000Z',
          violationLocation: 'A40',
          violationType: 'Geschwindigkeit',
          violationCategory: 'speed' as const,
        },
      }),
      ConflictException,
    );
    assert.equal(ctx.documents[0]!.status, 'needs_domain_review');
    assert.equal(ctx.fines.length, 0);
  });

  it('CELISKILI plaka/VIN yonlendirmeyi engeller', async () => {
    const ctx = build({
      typeKey: 'traffic_fine@v1',
      vehicleId: null,
      vehicleMatchStatus: 'failed',
    });
    await assert.rejects(
      ctx.service.route('user-office', 'office', 'doc-1', {
        fine: {
          violationAt: '2026-07-11T08:15:00.000Z',
          violationLocation: 'A40',
          violationType: 'Geschwindigkeit',
          violationCategory: 'speed' as const,
        },
      }),
      ConflictException,
    );
    assert.ok(String(ctx.documents[0]!.domainReviewReason).includes('vehicle'));
  });
});

describe('Yonlendirme — EXACTLY-ONCE', () => {
  const fine = {
    violationAt: '2026-07-11T08:15:00.000Z',
    violationLocation: 'A40 Essen',
    violationType: 'Geschwindigkeit',
    violationCategory: 'speed' as const,
  };

  it('tekrarlanan istek IKINCI kayit uretmez', async () => {
    const ctx = build({ typeKey: 'traffic_fine@v1' });
    const first = await ctx.service.route('user-office', 'office', 'doc-1', { fine });
    const second = await ctx.service.route('user-office', 'office', 'doc-1', { fine });

    assert.equal(first.alreadyRouted, false);
    assert.equal(second.alreadyRouted, true);
    assert.equal(second.entityId, first.entityId);
    assert.equal(ctx.fines.length, 1, 'ikinci Fine olusmus');
    assert.equal(ctx.routings.length, 1);
  });

  it('ESZAMANLI iki onayda ikinci domain kaydi GERI ALINIR', async () => {
    const ctx = build({ typeKey: 'traffic_fine@v1' });

    // Ikisi de `routing` yokken basliyor — gercek yaris.
    const [left, right] = await Promise.all([
      ctx.service.route('user-office', 'office', 'doc-1', { fine }),
      ctx.service.route('user-office', 'office', 'doc-1', { fine }),
    ]);

    assert.equal(ctx.fines.length, 1, 'yaris ikinci Fine uretmis');
    assert.equal(ctx.routings.length, 1);
    // Ikisi de AYNI kaydi gosteriyor.
    assert.equal(left.entityId, right.entityId);
    assert.ok(left.alreadyRouted || right.alreadyRouted);
  });

  it('zaten yonlendirilmis belge var olan bagi doner', async () => {
    const ctx = build({ typeKey: 'service_invoice@v1', routed: true });
    const result = await ctx.service.route('user-boss', 'boss', 'doc-1', {});
    assert.equal(result.alreadyRouted, true);
    assert.equal(result.entityId, 'job-existing');
    assert.equal(ctx.createdJobs.length, 0, 'ikinci is acilmis');
  });
});

describe('Yonlendirme — denetim', () => {
  it('denetime HANGI KAYIT yazilir, degerleri yazilmaz', async () => {
    const ctx = build({ typeKey: 'traffic_fine@v1' });
    await ctx.service.route('user-office', 'office', 'doc-1', {
      fine: {
        violationAt: '2026-07-11T08:15:00.000Z',
        violationLocation: 'A40 Essen Zufahrt 17',
        violationType: 'Geschwindigkeit',
        violationCategory: 'speed' as const,
        amount: 60,
      },
    });

    const entry = ctx.audits.find((row) => row.action === 'document_intake.routed');
    assert.ok(entry);
    const serialized = JSON.stringify(entry!.metadata);
    assert.ok(serialized.includes('fine.record'));
    // Ihlal yeri ve tutari DENETIME GIRMEZ.
    assert.ok(!serialized.includes('A40 Essen'), 'ihlal yeri denetime sizdi');
    assert.ok(!serialized.includes('60'), 'tutar denetime sizdi');
  });
});
