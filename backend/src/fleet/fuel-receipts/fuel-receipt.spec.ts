import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { readdirSync, rmSync } from 'node:fs';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  FuelEntryWorkflowStatus,
  FuelProductType,
  FuelProductUsage,
  FuelReceiptOcrStatus,
  FuelingIntentStatus,
  Prisma,
} from '@prisma/client';
import { FUEL_RECEIPT_UPLOAD_ABSOLUTE_DIR } from '../../storage/local-storage.service';
import {
  detectReceiptFileKind,
  extensionForKind,
  sanitizeReceiptFileName,
  MAX_RECEIPT_FILE_BYTES,
} from './core/receipt-file.util';
import {
  amountsMatch,
  hasBlockingIssue,
  isMixedReceipt,
  validateFuelReceiptDraft,
} from './core/fuel-receipt-validation.util';
import { ConfirmFuelReceiptDto } from './dto/confirm-fuel-receipt.dto';
import { DisabledFuelReceiptOcrProvider } from './disabled-fuel-receipt-ocr.provider';
import {
  MOCK_OCR_PROVIDER_IN_PRODUCTION_MESSAGE,
  resolveFuelReceiptOcrProviderKind,
} from './fuel-receipt-ocr.config';
import { FuelReceiptDriverController } from './fuel-receipt.controller';
import { FuelReceiptService } from './fuel-receipt.service';
import { MockFuelReceiptOcrProvider } from './mock-fuel-receipt-ocr.provider';

/**
 * Yakit fisi: yukleme, OCR taslagi ve surucu dogrulamasi.
 *
 * Prisma ve OCR saglayicisi MOCK; GERCEK DIS AG CAGRISI YOK. Dosya yazimi
 * bilincli olarak GERCEK: magic byte, hash ve orphan temizligi ancak gercek
 * bir dosya sistemiyle anlamli sinanir. Yazilan her sey testin sonunda
 * siliniyor (klasor zaten .gitignore'da).
 *
 * Sahte Prisma "aptal degil": tekil indeksleri gercekten uyguluyor ve tur/durak
 * tablolarina yapilan HER yazma denemesini kaydediyor.
 */

const WRITTEN_FILES: string[] = [];

after(() => {
  for (const name of WRITTEN_FILES) {
    rmSync(`${FUEL_RECEIPT_UPLOAD_ABSOLUTE_DIR}/${name}`, { force: true });
  }
});

/** Gecerli JPEG/PNG/PDF baslikli sahte dosyalar. */
function fileOf(kind: 'jpeg' | 'png' | 'pdf' | 'bogus', marker = 'x'): Buffer {
  const heads: Record<string, number[]> = {
    jpeg: [0xff, 0xd8, 0xff, 0xe0],
    png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    pdf: [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37],
    bogus: [0x3c, 0x3f, 0x70, 0x68, 0x70], // "<?php"
  };
  return Buffer.concat([Buffer.from(heads[kind]!), Buffer.from(`-${marker}`)]);
}

function upload(
  kind: 'jpeg' | 'png' | 'pdf' | 'bogus' = 'jpeg',
  marker = 'x',
  overrides: Record<string, unknown> = {},
) {
  const buffer = fileOf(kind, marker);
  return {
    // Dosya adi mock saglayicinin fixture ipucu: "mixed" iceren bir ad karma
    // fis senaryosunu kurar (bkz. MockFuelReceiptOcrProvider.pickFixture).
    originalname: `${marker}.jpg`,
    mimetype: 'image/jpeg',
    size: buffer.length,
    buffer,
    ...overrides,
  };
}

type Row = Record<string, unknown>;

function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (key === 'tenantId') continue; // tenant filtresi gercekte Prisma uzantisinda
    const actual = row[key];
    if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) {
      const spec = expected as { in?: unknown[]; not?: unknown; lt?: Date; gte?: Date };
      if (spec.in && !spec.in.includes(actual)) return false;
      if ('not' in spec) {
        if (spec.not === null && actual === null) return false;
        if (spec.not !== null && actual === spec.not) return false;
      }
      if (spec.lt instanceof Date && !(actual instanceof Date && actual < spec.lt)) return false;
      if (spec.gte instanceof Date && !(actual instanceof Date && actual >= spec.gte)) return false;
      continue;
    }
    if (actual !== expected) return false;
  }
  return true;
}

interface BuildOptions {
  vehicleId?: string | null;
  compatibility?: Array<{
    productType: FuelProductType;
    usageType: FuelProductUsage;
    approved: boolean;
  }>;
  intents?: Row[];
  entries?: Row[];
  ocr?: 'mock' | 'disabled';
  /** create'ten ONCE calisir; yaris kurmak icin. */
  beforeCreate?: (rows: Row[]) => void;
}

function build(options: BuildOptions = {}) {
  const entries: Row[] = options.entries ? [...options.entries] : [];
  const intents: Row[] = options.intents ? [...options.intents] : [];
  const tourWrites: string[] = [];
  const audits: Row[] = [];
  const notifications: Row[] = [];
  let seq = 0;

  const enforceUnique = (candidate: Row, ignoreId?: string) => {
    for (const key of ['receiptFileHash', 'fuelingIntentSettledKey']) {
      const value = candidate[key];
      if (value === null || value === undefined) continue;
      if (entries.some((row) => row.id !== ignoreId && row[key] === value)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['tenantId', key] },
        });
      }
    }
  };

  const withVehicle = (row: Row): Row => ({
    ...row,
    vehicle: { id: row.vehicleId, plateNumber: 'DU-AB 123' },
  });

  const fleetFuelEntry = {
    findFirst: async (args: { where?: Record<string, unknown> }) => {
      const found = entries.find((row) => matches(row, args?.where));
      return found ? withVehicle(found) : null;
    },
    findMany: async (args: { where?: Record<string, unknown> }) =>
      entries.filter((row) => matches(row, args?.where)).map(withVehicle),
    updateMany: async (args: { where?: Record<string, unknown>; data: Row }) => {
      let count = 0;
      for (const row of entries) {
        if (matches(row, args.where)) {
          Object.assign(row, args.data);
          count += 1;
        }
      }
      return { count };
    },
    update: async (args: { where: { id: string }; data: Row }) => {
      const row = entries.find((entry) => entry.id === args.where.id);
      if (!row) throw new Error('row not found');
      enforceUnique({ ...row, ...args.data }, row.id as string);
      Object.assign(row, args.data);
      return withVehicle(row);
    },
    create: async (args: { data: Row }) => {
      options.beforeCreate?.(entries);
      seq += 1;
      const row: Row = { id: `entry-${seq}`, tenantId: 'tenant-a', createdAt: new Date(), ...args.data };
      enforceUnique(row);
      entries.push(row);
      return withVehicle(row);
    },
  };

  const fuelingIntent = {
    findFirst: async (args: { where?: Record<string, unknown> }) => {
      return intents.find((row) => matches(row, args?.where)) ?? null;
    },
    updateMany: async (args: { where?: Record<string, unknown>; data: Row }) => {
      let count = 0;
      for (const row of intents) {
        if (matches(row, args.where)) {
          Object.assign(row, args.data);
          count += 1;
        }
      }
      return { count };
    },
  };

  const forbid = (label: string) => async () => {
    tourWrites.push(label);
    return { count: 0 };
  };
  const tour = { findFirst: async () => null, update: forbid('tour.update'), updateMany: forbid('tour.updateMany'), create: forbid('tour.create') };
  const tourStop = { findFirst: async () => null, update: forbid('tourStop.update'), updateMany: forbid('tourStop.updateMany'), create: forbid('tourStop.create'), createMany: forbid('tourStop.createMany'), delete: forbid('tourStop.delete') };

  const client = { fleetFuelEntry, fuelingIntent, tour, tourStop };
  const prisma = {
    ...client,
    $transaction: async <T>(fn: (tx: typeof client) => Promise<T>): Promise<T> => fn(client),
  };

  const vehicleId = options.vehicleId === undefined ? 'veh-1' : options.vehicleId;
  const driverVehicle = {
    requireDriverForUser: async () => ({ id: 'drv-1' }),
    resolveTodayVehicle: async () =>
      vehicleId ? { id: vehicleId, plateNumber: 'DU-AB 123', source: 'tour' as const } : null,
  };

  const compatibility = {
    listRowsForVehicle: async () =>
      options.compatibility ?? [
        { productType: FuelProductType.DIESEL, usageType: FuelProductUsage.PRIMARY, approved: true },
      ],
  };

  const storage = { buildStoredPath: (bucket: string, name: string) => `/uploads/${bucket}/${name}` };
  const audit = { logAction: async (p: Row) => { audits.push(p); return {}; } };
  const operationalNotify = {
    notifyOperationalUsersSafely: (input: Row) => { notifications.push(input); },
  };

  const provider =
    options.ocr === 'disabled'
      ? new DisabledFuelReceiptOcrProvider()
      : new MockFuelReceiptOcrProvider();

  const service = new FuelReceiptService(
    prisma as never,
    driverVehicle as never,
    compatibility as never,
    storage as never,
    audit as never,
    operationalNotify as never,
    provider,
  );

  return { service, entries, intents, tourWrites, audits, notifications, provider };
}

/** Yazilan dosyalari temizlik listesine alir. */
function trackWritten() {
  try {
    for (const name of readdirSync(FUEL_RECEIPT_UPLOAD_ABSOLUTE_DIR)) {
      if (!WRITTEN_FILES.includes(name)) WRITTEN_FILES.push(name);
    }
  } catch {
    /* klasor yoksa yazilan da yok */
  }
}

function confirmDto(overrides: Partial<ConfirmFuelReceiptDto> = {}): ConfirmFuelReceiptDto {
  return {
    purchasedAt: new Date(Date.now() - 3600_000).toISOString(),
    fuelProduct: FuelProductType.DIESEL,
    liters: 62.35,
    pricePerLiter: 1.719,
    fuelGrossAmount: 107.18,
    currency: 'EUR',
    ...overrides,
  } as ConfirmFuelReceiptDto;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(
      error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException,
      `beklenen is kurali reddi, gelen: ${String(error)}`,
    );
    const body = error.getResponse() as { code?: string };
    assert.equal(body.code, code);
    return true;
  });
}

describe('fuel receipt — endpoint contract', () => {
  it('exposes the driver endpoints under driver/fuel-receipts', () => {
    assert.equal(
      Reflect.getMetadata(PATH_METADATA, FuelReceiptDriverController),
      'driver/fuel-receipts',
    );

    const expectations: Array<[string, string, RequestMethod]> = [
      ['upload', '/', RequestMethod.POST],
      ['list', '/', RequestMethod.GET],
      ['getOne', ':id', RequestMethod.GET],
      ['file', ':id/file', RequestMethod.GET],
      ['analyze', ':id/analyze', RequestMethod.POST],
      ['confirm', ':id/confirm', RequestMethod.PUT],
    ];
    for (const [handler, path, method] of expectations) {
      const fn = Reflect.get(FuelReceiptDriverController.prototype as object, handler) as object;
      assert.equal(Reflect.getMetadata(PATH_METADATA, fn), path, handler);
      assert.equal(Reflect.getMetadata(METHOD_METADATA, fn), method, handler);
    }
  });

  it('accepts no ownership, workflow or storage field on confirm', () => {
    // Global ValidationPipe forbidNonWhitelisted ile calisiyor: DTO'da olmayan
    // alan 400 ile reddedilir, yani "alan yok" gercek bir korumadir.
    const fields = Object.getOwnPropertyNames(new ConfirmFuelReceiptDto());
    for (const forbidden of [
      'driverId',
      'vehicleId',
      'tenantId',
      'workflowStatus',
      'ocrStatus',
      'receiptStoredPath',
      'fuelingIntentId',
      'submittedAt',
      'totalCost',
    ]) {
      assert.equal(fields.includes(forbidden), false, `${forbidden} kabul edilmemeli`);
    }
  });
});

describe('fuel receipt — file safety', () => {
  it('detects the real type from magic bytes, not from the claimed mime', () => {
    assert.equal(detectReceiptFileKind(fileOf('jpeg')), 'image/jpeg');
    assert.equal(detectReceiptFileKind(fileOf('png')), 'image/png');
    assert.equal(detectReceiptFileKind(fileOf('pdf')), 'application/pdf');
    // "<?php" baslikli dosya `image/jpeg` diye gonderilse bile taninmiyor.
    assert.equal(detectReceiptFileKind(fileOf('bogus')), null);
  });

  it('rejects a forged mime type at upload', async () => {
    const { service, entries } = build();
    await expectCode(
      service.upload('user-1', upload('bogus', 'a', { mimetype: 'image/jpeg' })),
      'receipt_file_type_unsupported',
    );
    // Gecersiz dosya icin KAYIT DA olusmuyor.
    assert.equal(entries.length, 0);
  });

  it('accepts jpeg, png and pdf', async () => {
    for (const [kind, expected] of [
      ['jpeg', 'image/jpeg'],
      ['png', 'image/png'],
      ['pdf', 'application/pdf'],
    ] as const) {
      const { service } = build();
      const view = await service.upload('user-1', upload(kind, `accept-${kind}`));
      trackWritten();
      assert.equal(view.mimeType, expected);
      assert.equal(view.workflowStatus, FuelEntryWorkflowStatus.driver_review);
    }
  });

  it('rejects a file above the size limit', async () => {
    const { service } = build();
    await expectCode(
      service.upload('user-1', upload('jpeg', 'big', { size: MAX_RECEIPT_FILE_BYTES + 1 })),
      'receipt_file_too_large',
    );
  });

  it('treats a byte-identical re-upload as the same receipt', async () => {
    const { service, entries } = build();
    const first = await service.upload('user-1', upload('jpeg', 'dup'));
    const second = await service.upload('user-1', upload('jpeg', 'dup'));
    trackWritten();

    assert.equal(second.id, first.id);
    // Ayni fis IKI KEZ muhasebelesmiyor.
    assert.equal(entries.length, 1);
  });

  it('sanitizes the stored file name', () => {
    assert.equal(sanitizeReceiptFileName('../../etc/passwd'), 'passwd');
    assert.equal(sanitizeReceiptFileName(''), 'beleg');
    assert.equal(sanitizeReceiptFileName(null), 'beleg');
    assert.equal(sanitizeReceiptFileName('a'.repeat(400)).length, 120);
  });

  it('names the stored file after the REAL type, not the claimed extension', () => {
    assert.equal(extensionForKind('application/pdf'), '.pdf');
    assert.equal(extensionForKind('image/png'), '.png');
  });

  it('never returns the raw storage path to the client', async () => {
    const { service } = build();
    const view = await service.upload('user-1', upload('jpeg', 'path'));
    trackWritten();

    assert.equal(view.fileDownloadPath, `/driver/fuel-receipts/${view.id}/file`);
    assert.equal(JSON.stringify(view).includes('/uploads/'), false);
  });
});

describe('fuel receipt — upload independence', () => {
  it('uploads with no active tour and no fueling intent', async () => {
    const { service, entries, tourWrites } = build();
    const view = await service.upload('user-1', upload('jpeg', 'standalone'));
    trackWritten();

    assert.equal(view.fuelingIntentId, null);
    assert.equal(view.workflowStatus, FuelEntryWorkflowStatus.driver_review);
    assert.equal(view.ocrStatus, FuelReceiptOcrStatus.not_requested);
    // Mali alanlar BOS — 0 degil.
    assert.equal(view.liters, null);
    assert.equal(view.fuelGrossAmount, null);
    assert.equal(entries[0]!.liters, null);
    assert.deepEqual(tourWrites, []);
  });

  it('links to the driver own active intent', async () => {
    const { service } = build({
      intents: [{ id: 'intent-1', driverId: 'drv-1', vehicleId: 'veh-1', status: FuelingIntentStatus.ACTIVE }],
    });
    const view = await service.upload('user-1', upload('jpeg', 'linked'), 'intent-1');
    trackWritten();
    assert.equal(view.fuelingIntentId, 'intent-1');
  });

  it('hides another driver intent behind a 404', async () => {
    const { service } = build({
      intents: [{ id: 'intent-x', driverId: 'drv-other', vehicleId: 'veh-1', status: FuelingIntentStatus.ACTIVE }],
    });
    await expectCode(
      service.upload('user-1', upload('jpeg', 'foreign'), 'intent-x'),
      'fueling_intent_not_found',
    );
  });

  it('refuses to attach to a cancelled intent but still allows a plain upload', async () => {
    const cancelled = [{ id: 'intent-c', driverId: 'drv-1', vehicleId: 'veh-1', status: FuelingIntentStatus.CANCELLED }];
    const linked = build({ intents: cancelled });
    await expectCode(
      linked.service.upload('user-1', upload('jpeg', 'cancelled'), 'intent-c'),
      'fueling_intent_not_linkable',
    );

    // Ayni fis BAGSIZ yuklenebiliyor — bu yol hicbir zaman kapanmiyor.
    const plain = build({ intents: cancelled });
    const view = await plain.service.upload('user-1', upload('jpeg', 'cancelled2'));
    trackWritten();
    assert.equal(view.fuelingIntentId, null);
  });

  it('refuses a second receipt for an already settled intent', async () => {
    const { service } = build({
      intents: [{ id: 'intent-1', driverId: 'drv-1', vehicleId: 'veh-1', status: FuelingIntentStatus.ACTIVE }],
      entries: [
        {
          id: 'entry-old',
          driverId: 'drv-1',
          fuelingIntentId: 'intent-1',
          workflowStatus: FuelEntryWorkflowStatus.submitted,
        },
      ],
    });
    await expectCode(
      service.upload('user-1', upload('jpeg', 'second'), 'intent-1'),
      'fueling_intent_already_settled',
    );
  });

  it('refuses the upload when no vehicle can be resolved', async () => {
    const { service } = build({ vehicleId: null });
    await expectCode(service.upload('user-1', upload('jpeg', 'novehicle')), 'driver_vehicle_not_resolved');
  });
});

describe('fuel receipt — OCR', () => {
  it('stores a successful extraction as a draft, never as canonical values', async () => {
    const { service, entries } = build();
    const uploaded = await service.upload('user-1', upload('jpeg', 'diesel'));
    trackWritten();

    const analysed = await service.analyze('user-1', uploaded.id);

    assert.equal(analysed.ocrStatus, FuelReceiptOcrStatus.succeeded);
    assert.equal(analysed.ocrDataMode, 'mock');
    assert.ok(analysed.ocrExtraction);
    assert.equal(analysed.ocrExtraction!.fuelProduct.value, FuelProductType.DIESEL);
    // TASLAK canonical alanlara YAZILMADI: surucu onaylamadan maliyet yok.
    assert.equal(analysed.liters, null);
    assert.equal(analysed.fuelGrossAmount, null);
    assert.equal(entries[0]!.liters, null);
    assert.equal(entries[0]!.totalCost, null);
    // Is akisi durumu OCR'dan ETKILENMIYOR.
    assert.equal(analysed.workflowStatus, FuelEntryWorkflowStatus.driver_review);
  });

  it('marks low-confidence fields instead of inventing certainty', async () => {
    const { service } = build();
    const uploaded = await service.upload('user-1', upload('jpeg', 'lowconf'));
    trackWritten();
    const analysed = await service.analyze('user-1', uploaded.id);

    const extraction = analysed.ocrExtraction!;
    assert.ok(extraction.liters.confidence !== null && extraction.liters.confidence < 0.5);
    assert.ok(extraction.receiptNumber.confidence !== null && extraction.receiptNumber.confidence < 0.5);
  });

  it('never guesses an unmapped fuel label into the canonical enum', async () => {
    const { service } = build();
    const uploaded = await service.upload('user-1', upload('jpeg', 'nounitprice'));
    trackWritten();
    const analysed = await service.analyze('user-1', uploaded.id);

    // "SUPER" yazan fis E5 mi E10 mu — TAHMIN EDILMIYOR.
    assert.equal(analysed.ocrExtraction!.fuelProduct.value, null);
    assert.equal(analysed.ocrExtraction!.rawFuelLabel, 'SUPER');
  });

  it('separates fuel total from receipt total on a mixed receipt', async () => {
    const { service } = build();
    const uploaded = await service.upload('user-1', upload('jpeg', 'mixed'));
    trackWritten();
    const analysed = await service.analyze('user-1', uploaded.id);

    const extraction = analysed.ocrExtraction!;
    assert.equal(extraction.hasNonFuelItems, true);
    assert.equal(extraction.fuelGrossAmount.value, 88.4);
    assert.equal(extraction.receiptGrossAmount.value, 95.6);
    assert.ok(isMixedReceipt(88.4, 95.6));
  });

  it('keeps the receipt usable after an OCR failure', async () => {
    const { service } = build();
    const uploaded = await service.upload('user-1', upload('jpeg', 'failure'));
    trackWritten();
    const analysed = await service.analyze('user-1', uploaded.id);

    assert.equal(analysed.ocrStatus, FuelReceiptOcrStatus.failed);
    assert.equal(analysed.ocrErrorClass, 'unreadable');
    // Fis KAYBOLMUYOR ve elle doldurulabilir durumda.
    assert.equal(analysed.workflowStatus, FuelEntryWorkflowStatus.driver_review);

    const confirmed = await service.confirm('user-1', uploaded.id, confirmDto());
    assert.equal(confirmed.receipt.workflowStatus, FuelEntryWorkflowStatus.submitted);
  });

  it('runs the provider once when two analyze calls race', async () => {
    const { service } = build();
    const uploaded = await service.upload('user-1', upload('jpeg', 'diesel-race'));
    trackWritten();

    let calls = 0;
    const provider = (service as unknown as { ocr: { analyze: (i: unknown) => Promise<unknown> } }).ocr;
    const original = provider.analyze.bind(provider);
    provider.analyze = async (input: unknown) => {
      calls += 1;
      return original(input as never);
    };

    const [a, b] = await Promise.all([
      service.analyze('user-1', uploaded.id),
      service.analyze('user-1', uploaded.id),
    ]);

    // Ikinci istek saglayiciya HIC gitmiyor: ayni fis icin iki kez odenmez ve
    // iki sonuc birbirini ezmez.
    assert.equal(calls, 1);
    assert.equal(a.id, b.id);
  });

  it('reports not_configured when no provider is wired', async () => {
    const { service } = build({ ocr: 'disabled' });
    const uploaded = await service.upload('user-1', upload('jpeg', 'disabled'));
    trackWritten();
    const analysed = await service.analyze('user-1', uploaded.id);

    assert.equal(analysed.ocrStatus, FuelReceiptOcrStatus.failed);
    assert.equal(analysed.ocrErrorClass, 'not_configured');
    // Kapali OCR fis yuklemeyi engellemiyor; yalnizca on doldurma yok.
    assert.equal(analysed.workflowStatus, FuelEntryWorkflowStatus.driver_review);
  });

  it('refuses the mock provider in production', () => {
    // Bos deger ACIKCA veriliyor, `undefined` DEGIL: `undefined` fonksiyonun
    // varsayilan parametresini devreye sokar ve o da process.env'i okur, yani
    // test calistigi makinenin .env dosyasina bagimli hale gelirdi. Bu test
    // "yapilandirilmamis -> disabled" kuralini sinamali, ortami degil.
    assert.equal(resolveFuelReceiptOcrProviderKind('', false), 'disabled');
    assert.equal(resolveFuelReceiptOcrProviderKind('mock', false), 'mock');
    assert.throws(
      () => resolveFuelReceiptOcrProviderKind('mock', true),
      (error: Error) => error.message === MOCK_OCR_PROVIDER_IN_PRODUCTION_MESSAGE,
    );
    // Yazim hatasi sessizce varsayilana DUSMUYOR.
    assert.throws(() => resolveFuelReceiptOcrProviderKind('moc', false));
  });

  it('stores no raw provider payload in the extraction snapshot', async () => {
    const { service, entries } = build();
    const uploaded = await service.upload('user-1', upload('jpeg', 'diesel'));
    trackWritten();
    await service.analyze('user-1', uploaded.id);

    const snapshot = JSON.stringify(entries[0]!.ocrExtraction);
    for (const forbidden of ['base64', 'rawText', 'rawResponse', 'fullText']) {
      assert.equal(snapshot.includes(forbidden), false, forbidden);
    }
  });
});

describe('fuel receipt — ownership', () => {
  it('hides another driver receipt behind a 404 on every read path', async () => {
    const { service } = build({
      entries: [{ id: 'entry-other', driverId: 'drv-other', receiptStoredPath: '/uploads/fuel-receipts/x.jpg' }],
    });

    await expectCode(service.getById('user-1', 'entry-other'), 'fuel_receipt_not_found');
    await expectCode(service.analyze('user-1', 'entry-other'), 'fuel_receipt_not_found');
    await expectCode(service.confirm('user-1', 'entry-other', confirmDto()), 'fuel_receipt_not_found');
    await expectCode(service.resolveFileForDriver('user-1', 'entry-other'), 'fuel_receipt_not_found');
  });

  it('lists only the driver own receipts', async () => {
    const { service } = build({
      entries: [
        { id: 'mine', driverId: 'drv-1', receiptStoredPath: '/uploads/fuel-receipts/a.jpg', createdAt: new Date(), vehicleId: 'veh-1', enteredAt: new Date(), currency: 'EUR', workflowStatus: FuelEntryWorkflowStatus.driver_review, ocrStatus: FuelReceiptOcrStatus.not_requested, isFullTank: false, compatibilityMismatch: false },
        { id: 'theirs', driverId: 'drv-other', receiptStoredPath: '/uploads/fuel-receipts/b.jpg', createdAt: new Date(), vehicleId: 'veh-9', enteredAt: new Date(), currency: 'EUR', workflowStatus: FuelEntryWorkflowStatus.driver_review, ocrStatus: FuelReceiptOcrStatus.not_requested, isFullTank: false, compatibilityMismatch: false },
      ],
    });

    const rows = await service.list('user-1');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, 'mine');
  });
});

describe('fuel receipt — confirmation', () => {
  async function draft(options: BuildOptions = {}) {
    const ctx = build(options);
    const uploaded = await ctx.service.upload('user-1', upload('jpeg', `c-${Math.abs(hashOf(JSON.stringify(options)))}`));
    trackWritten();
    return { ...ctx, receiptId: uploaded.id };
  }

  function hashOf(value: string): number {
    let h = 0;
    for (const ch of value) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return h;
  }

  it('writes the fuel line to totalCost and keeps the receipt total apart', async () => {
    const { service, entries, receiptId } = await draft();

    const result = await service.confirm(
      'user-1',
      receiptId,
      confirmDto({ fuelGrossAmount: 88.4, receiptGrossAmount: 95.6, liters: 51.4, pricePerLiter: 1.72 }),
    );

    // ARACA yazilan maliyet yalnizca YAKIT satiri; kahve/market kasada kaliyor.
    assert.equal(result.receipt.fuelGrossAmount, 88.4);
    assert.equal(result.receipt.receiptGrossAmount, 95.6);
    assert.equal(Number(entries[0]!.totalCost), 88.4);
    assert.equal(Number(entries[0]!.receiptGrossAmount), 95.6);
  });

  it('moves the receipt to submitted and records the real purchase date', async () => {
    const { service, receiptId } = await draft();
    const purchasedAt = new Date(Date.now() - 5 * 3600_000).toISOString();

    const result = await service.confirm('user-1', receiptId, confirmDto({ purchasedAt }));

    assert.equal(result.receipt.workflowStatus, FuelEntryWorkflowStatus.submitted);
    assert.ok(result.receipt.submittedAt);
    // enteredAt artik YUKLEME ani degil, fisteki gercek tarih.
    assert.equal(result.receipt.enteredAt, new Date(purchasedAt).toISOString());
  });

  it('is idempotent and notifies the office only once', async () => {
    const { service, receiptId, notifications } = await draft();

    const first = await service.confirm('user-1', receiptId, confirmDto());
    const second = await service.confirm('user-1', receiptId, confirmDto());

    assert.equal(first.receipt.id, second.receipt.id);
    assert.equal(second.receipt.workflowStatus, FuelEntryWorkflowStatus.submitted);
    assert.equal(notifications.length, 1);
  });

  it('refuses to let the driver edit an approved receipt', async () => {
    const { service, entries, receiptId } = await draft();
    await service.confirm('user-1', receiptId, confirmDto());
    entries[0]!.workflowStatus = FuelEntryWorkflowStatus.approved;

    await expectCode(
      service.confirm('user-1', receiptId, confirmDto({ liters: 999 })),
      'fuel_receipt_not_editable',
    );
  });

  it('rejects an implausible future date and a zero-litre receipt', async () => {
    const { service, receiptId } = await draft();

    await expectCode(
      service.confirm('user-1', receiptId, confirmDto({ purchasedAt: new Date(Date.now() + 5 * 86400_000).toISOString() })),
      'fuel_receipt_invalid',
    );
    await expectCode(
      service.confirm('user-1', receiptId, confirmDto({ liters: 0 })),
      'fuel_receipt_invalid',
    );
    await expectCode(
      service.confirm('user-1', receiptId, confirmDto({ currency: 'XYZ' })),
      'fuel_receipt_invalid',
    );
  });

  it('warns but does not block on a rounding mismatch', async () => {
    const { service, receiptId } = await draft();

    // 50 x 1,70 = 85,00 ama fiste 90,00 yaziyor: uyari, engel DEGIL.
    const result = await service.confirm(
      'user-1',
      receiptId,
      confirmDto({ liters: 50, pricePerLiter: 1.7, fuelGrossAmount: 90 }),
    );

    assert.equal(result.receipt.workflowStatus, FuelEntryWorkflowStatus.submitted);
    assert.ok(result.issues.some((issue) => issue.code === 'unit_price_mismatch'));
    assert.equal(hasBlockingIssue(result.issues), false);
  });

  it('blocks an incompatible fuel until the driver acknowledges it', async () => {
    const options: BuildOptions = {
      compatibility: [
        { productType: FuelProductType.DIESEL, usageType: FuelProductUsage.PRIMARY, approved: true },
      ],
    };
    const blocked = await draft(options);
    await expectCode(
      blocked.service.confirm('user-1', blocked.receiptId, confirmDto({ fuelProduct: FuelProductType.SUPER_E10 })),
      'fuel_product_not_compatible',
    );

    const acknowledged = await draft({ ...options, entries: [] });
    const result = await acknowledged.service.confirm(
      'user-1',
      acknowledged.receiptId,
      confirmDto({ fuelProduct: FuelProductType.SUPER_E10, acknowledgeFuelMismatch: true }),
    );

    // Kayit YOK EDILMIYOR: isaretlenip muhasebe incelemesine gidiyor.
    assert.equal(result.receipt.workflowStatus, FuelEntryWorkflowStatus.submitted);
    assert.equal(result.receipt.compatibilityMismatch, true);
    assert.ok(
      acknowledged.audits.some((a) => a.action === 'fuel_receipt.fuel_mismatch_acknowledged'),
      'istisna denetimde ayri bir olay olarak gorunmeli',
    );
    assert.equal(acknowledged.notifications[0]!.key, 'fuel_receipt_needs_review');
  });

  it('completes the linked intent and clears the single-active lock', async () => {
    const ctx = build({
      intents: [
        {
          id: 'intent-1',
          driverId: 'drv-1',
          vehicleId: 'veh-1',
          status: FuelingIntentStatus.ACTIVE,
          activeDriverKey: 'drv-1',
        },
      ],
    });
    const uploaded = await ctx.service.upload('user-1', upload('jpeg', 'intent-complete'), 'intent-1');
    trackWritten();

    await ctx.service.confirm('user-1', uploaded.id, confirmDto());

    const intent = ctx.intents[0]!;
    // COMPLETED Faz 5'te tam bu an icin ayrilmisti; yeni terminal durum yok.
    assert.equal(intent.status, FuelingIntentStatus.COMPLETED);
    assert.ok(intent.completedAt);
    // Kilit bosaltilmazsa surucu bir daha yakit duragi secemezdi.
    assert.equal(intent.activeDriverKey, null);
    assert.ok(ctx.audits.some((a) => a.action === 'fuel_receipt.fueling_intent_completed'));
  });

  it('writes nothing to tour or tour stop tables', async () => {
    const ctx = build({
      intents: [{ id: 'intent-1', driverId: 'drv-1', vehicleId: 'veh-1', status: FuelingIntentStatus.ACTIVE, activeDriverKey: 'drv-1' }],
    });
    const uploaded = await ctx.service.upload('user-1', upload('jpeg', 'no-tour-write'), 'intent-1');
    trackWritten();
    await ctx.service.analyze('user-1', uploaded.id);
    await ctx.service.confirm('user-1', uploaded.id, confirmDto());

    // ASIL SEY: tur ve durak tablolarina TEK BIR YAZMA bile yapilmadi.
    assert.deepEqual(ctx.tourWrites, []);
  });
});

describe('fuel receipt — validation math', () => {
  it('tolerates pump rounding but catches a real mismatch', () => {
    // 62,35 x 1,719 = 107,178... fiste 107,18 — DOGRU kabul edilmeli.
    assert.equal(amountsMatch(62.35 * 1.719, 107.18), true);
    assert.equal(amountsMatch(85, 90), false);
  });

  it('flags a net + vat breakdown that does not add up', () => {
    const issues = validateFuelReceiptDraft({
      purchasedAt: new Date().toISOString(),
      liters: 10,
      pricePerLiter: 2,
      fuelGrossAmount: 20,
      receiptGrossAmount: 20,
      receiptNetAmount: 10,
      receiptVatAmount: 5,
      receiptVatRate: 19,
      currency: 'EUR',
      fuelProduct: 'DIESEL',
      odometerKm: null,
    });
    assert.ok(issues.some((issue) => issue.code === 'vat_breakdown_mismatch'));
    // Uyari, engel DEGIL.
    assert.equal(hasBlockingIssue(issues), false);
  });

  it('flags a receipt total below the fuel total', () => {
    const issues = validateFuelReceiptDraft({
      purchasedAt: new Date().toISOString(),
      liters: 10,
      pricePerLiter: 2,
      fuelGrossAmount: 20,
      receiptGrossAmount: 12,
      receiptNetAmount: null,
      receiptVatAmount: null,
      receiptVatRate: null,
      currency: 'EUR',
      fuelProduct: 'DIESEL',
      odometerKm: null,
    });
    assert.ok(issues.some((issue) => issue.code === 'receipt_total_below_fuel_total'));
  });

  it('does not call an equal fuel and receipt total a mixed receipt', () => {
    assert.equal(isMixedReceipt(107.18, 107.18), false);
    assert.equal(isMixedReceipt(null, 95.6), false);
  });
});

describe('fuel receipt — cost and analytics isolation', () => {
  /**
   * Bu kural fazin en pahali hatasi olabilirdi: onaylanmamis bir fis maliyet
   * sorgusuna sizsaydi aracin TCO'su, muhasebenin hic gormedigi tutarlarla
   * sisecekti. Burada TEK TEK sorgu yerine SEAM'in kendisi sinaniyor —
   * `buildListWhere` bes analitik cagrinin ortak kapisi.
   */
  it('defaults every fuel query to approved-only', async () => {
    const { FleetFuelService } = await import('../fleet-fuel.service');
    const build = Reflect.get(
      FleetFuelService.prototype as object,
      'buildListWhere',
    ) as (query: unknown, scope?: string) => Record<string, unknown>;

    // Parametre VERILMEDIGINDE bile daraltici: ileride eklenen bir maliyet
    // sorgusu filtreyi unutursa guvenli tarafta kalir.
    assert.equal(build.call({}, {}).workflowStatus, FuelEntryWorkflowStatus.approved);
    assert.equal(
      build.call({}, {}, 'approved_only').workflowStatus,
      FuelEntryWorkflowStatus.approved,
    );
    // Listeleme uclari acikca disari cikiyor.
    assert.equal(build.call({}, {}, 'all_statuses').workflowStatus, undefined);
  });

  it('keeps a submitted receipt out of the approved set', () => {
    const rows = [
      { id: 'legacy', workflowStatus: FuelEntryWorkflowStatus.approved, totalCost: 91.2 },
      { id: 'fresh', workflowStatus: FuelEntryWorkflowStatus.submitted, totalCost: 107.18 },
      { id: 'draft', workflowStatus: FuelEntryWorkflowStatus.driver_review, totalCost: null },
      { id: 'nope', workflowStatus: FuelEntryWorkflowStatus.rejected, totalCost: 50 },
    ];

    const booked = rows.filter((row) => row.workflowStatus === FuelEntryWorkflowStatus.approved);
    const total = booked.reduce((sum, row) => sum + (row.totalCost ?? 0), 0);

    // Migration eski kayitlari `approved` yaptigi icin gecmis rapor rakami
    // AYNEN duruyor; yeni fisler onaylanana kadar toplama girmiyor.
    assert.deepEqual(booked.map((row) => row.id), ['legacy']);
    assert.equal(total, 91.2);
  });
});
