import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { FuelEntryWorkflowStatus } from '@prisma/client';
import {
  DEFAULT_BASE_CURRENCY,
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
  matchesBaseCurrency,
  normalizeCurrency,
} from './currency';
import { TenantSettingsService } from '../../tenant/tenant-settings.service';

/**
 * Faz 7.1: tip guvenligi ve kiraci temel para birimi.
 *
 * En onemli test dosyanin BASINDA: CLAUDE.md kural 1 ("as any YASAK") artik
 * kaynak uzerinde CIVILENMIS durumda — yorumla degil, testle.
 */

describe('CLAUDE.md kural 1 — getVehicleCosts tip guvenligi', () => {
  /** getVehicleCosts govdesini kaynaktan okur. */
  function vehicleCostsSource(): string {
    const file = join(__dirname, '..', '..', 'dashboard', 'dashboard.service.ts');
    const source = readFileSync(file, 'utf8');
    const start = source.indexOf('async getVehicleCosts');
    assert.ok(start > 0, 'getVehicleCosts bulunamadi');

    // Bir sonraki metoda kadar olan bolum.
    const rest = source.slice(start + 1);
    const nextMethod = rest.search(/\n  (private |async |[a-zA-Z]+\()/);
    return rest.slice(0, nextMethod > 0 ? nextMethod : rest.length);
  }

  it('contains no `as any` and no `: any` annotation', () => {
    const body = vehicleCostsSource();

    // `as any` uzerinden Prisma'ya erismek, tenant kapsamli istemcinin
    // tiplerini komple devre disi birakiyordu: yanlis alan adi ya da silinmis
    // bir kolon derleyiciden SESSIZCE gecerdi.
    assert.equal(/\bas any\b/.test(body), false, '`as any` geri gelmis');
    assert.equal(/:\s*any\b/.test(body), false, '`: any` anotasyonu geri gelmis');
  });

  it('uses the tenant-scoped prisma client directly', () => {
    const body = vehicleCostsSource();

    assert.equal(/const db = this\.prisma/.test(body), false, '`db` takma adi geri gelmis');
    for (const model of ['vehicle', 'serviceRecord', 'fine', 'assignment', 'fleetFuelEntry']) {
      assert.ok(
        body.includes(`this.prisma.${model}.`),
        `${model} tipli istemciden okunmali`,
      );
    }
  });
});

describe('currency util', () => {
  it('normalises only well-formed ISO-4217 codes', () => {
    assert.equal(normalizeCurrency(' eur '), 'EUR');
    assert.equal(normalizeCurrency('try'), 'TRY');
    // Tahmin YOK: bicimi tutmayan deger null.
    assert.equal(normalizeCurrency('EURO'), null);
    assert.equal(normalizeCurrency('E1R'), null);
    assert.equal(normalizeCurrency(''), null);
    assert.equal(normalizeCurrency(null), null);
  });

  it('includes TRY — the reason this util exists', () => {
    // Faz 6'daki yerel liste TRY icermiyordu ve urun Turkiye'ye aciliyor.
    assert.ok((SUPPORTED_CURRENCIES as readonly string[]).includes('TRY'));
    assert.ok((SUPPORTED_CURRENCIES as readonly string[]).includes('EUR'));
    assert.equal(isSupportedCurrency('TRY'), true);
    assert.equal(isSupportedCurrency('XYZ'), false);
  });

  it('treats a missing record currency as the base currency', () => {
    // Eski kayitlar migration'da backfill edildi; yine de null gelen bir deger
    // "yabanci para" sayilip toplamdan DUSMEMELI.
    assert.equal(matchesBaseCurrency(null, 'EUR'), true);
    assert.equal(matchesBaseCurrency('EUR', 'EUR'), true);
    assert.equal(matchesBaseCurrency('TRY', 'EUR'), false);
    assert.equal(matchesBaseCurrency('EUR', 'TRY'), false);
    assert.equal(matchesBaseCurrency('try', 'TRY'), true);
  });

  it('defaults to EUR', () => {
    assert.equal(DEFAULT_BASE_CURRENCY, 'EUR');
  });
});

describe('vehicle cost currency rules', () => {
  /**
   * Toplama katilma sarti: kaydin para birimi TENANT'IN temel para birimiyle
   * ayni olmali. Faz 7'de bu kontrol 'EUR' sabitine bagliydi.
   */
  function bookable(
    rows: Array<{ currency: string; amount: number; status?: FuelEntryWorkflowStatus }>,
    baseCurrency: string,
  ) {
    return rows
      .filter((row) => matchesBaseCurrency(row.currency, baseCurrency))
      .filter((row) => row.status === undefined || row.status === FuelEntryWorkflowStatus.approved)
      .reduce((sum, row) => sum + row.amount, 0);
  }

  it('sums EUR records for a EUR tenant', () => {
    assert.equal(
      bookable([{ currency: 'EUR', amount: 107.18 }, { currency: 'EUR', amount: 70.5 }], 'EUR'),
      177.68,
    );
  });

  it('sums TRY records for a TRY tenant', () => {
    assert.equal(
      bookable([{ currency: 'TRY', amount: 1500 }, { currency: 'TRY', amount: 2500 }], 'TRY'),
      4000,
    );
  });

  it('keeps a TRY receipt out of a EUR tenant total', () => {
    assert.equal(
      bookable([{ currency: 'EUR', amount: 100 }, { currency: 'TRY', amount: 5000 }], 'EUR'),
      100,
    );
  });

  it('keeps a EUR receipt out of a TRY tenant total', () => {
    // Simetrik: yon fark etmez, farkli para birimi toplama girmez.
    assert.equal(
      bookable([{ currency: 'TRY', amount: 5000 }, { currency: 'EUR', amount: 100 }], 'TRY'),
      5000,
    );
  });

  it('still excludes pending and rejected receipts', () => {
    const total = bookable(
      [
        { currency: 'EUR', amount: 100, status: FuelEntryWorkflowStatus.approved },
        { currency: 'EUR', amount: 200, status: FuelEntryWorkflowStatus.submitted },
        { currency: 'EUR', amount: 300, status: FuelEntryWorkflowStatus.rejected },
        { currency: 'EUR', amount: 400, status: FuelEntryWorkflowStatus.driver_review },
      ],
      'EUR',
    );
    assert.equal(total, 100);
  });

  it('groups the unconverted amounts by their real currency', () => {
    const approved = [
      { currency: 'EUR', amount: 100 },
      { currency: 'TRY', amount: 5000 },
      { currency: 'TRY', amount: 1500 },
      { currency: 'CHF', amount: 80 },
    ];
    const base = 'EUR';

    const buckets = new Map<string, { amount: number; count: number }>();
    for (const row of approved.filter((r) => !matchesBaseCurrency(r.currency, base))) {
      const bucket = buckets.get(row.currency) ?? { amount: 0, count: 0 };
      bucket.amount += row.amount;
      bucket.count += 1;
      buckets.set(row.currency, bucket);
    }

    // Silinmediler, GERCEK para birimleriyle duruyorlar ve kur uydurulmadi.
    assert.deepEqual([...buckets.keys()].sort(), ['CHF', 'TRY']);
    assert.equal(buckets.get('TRY')!.amount, 6500);
    assert.equal(buckets.get('TRY')!.count, 2);
  });
});

describe('TenantSettingsService — base currency', () => {
  function build(options: {
    baseCurrency?: string;
    counts?: Partial<{ serviceRecords: number; fines: number; fuelEntries: number }>;
  } = {}) {
    const counts = { serviceRecords: 0, fines: 0, fuelEntries: 0, ...options.counts };
    const tenant = { baseCurrency: options.baseCurrency ?? 'EUR' };
    const audits: Array<Record<string, unknown>> = [];

    const prisma = {
      tenant: {
        findFirst: async () => tenant,
        updateMany: async (args: { data: { baseCurrency: string } }) => {
          tenant.baseCurrency = args.data.baseCurrency;
          return { count: 1 };
        },
      },
      serviceRecord: { count: async () => counts.serviceRecords },
      fine: { count: async () => counts.fines },
      fleetFuelEntry: { count: async () => counts.fuelEntries },
    };
    const audit = { logAction: async (p: Record<string, unknown>) => { audits.push(p); return {}; } };

    return {
      service: new TenantSettingsService(prisma as never, audit as never),
      tenant,
      audits,
    };
  }

  const withTenant = <T>(fn: () => Promise<T>) => {
    const { TenantContext } = require('../../tenant/tenant-context') as {
      TenantContext: { run: (id: string, cb: () => Promise<T>) => Promise<T> };
    };
    return TenantContext.run('tenant-a', fn);
  };

  it('reports EUR for an existing tenant after the migration', async () => {
    const { service } = build();
    const settings = await withTenant(() => service.getCurrencySettings());

    assert.equal(settings.baseCurrency, 'EUR');
    assert.equal(settings.changeable, true);
    assert.equal(settings.lockedReason, null);
  });

  it('lets an empty tenant switch to TRY', async () => {
    const { service, tenant, audits } = build();

    const settings = await withTenant(() => service.setBaseCurrency('user-admin', 'try'));

    assert.equal(settings.baseCurrency, 'TRY');
    assert.equal(tenant.baseCurrency, 'TRY');
    assert.ok(audits.some((a) => a.action === 'tenant.base_currency_changed'));
  });

  it('locks the change once any monetary record exists', async () => {
    for (const counts of [
      { serviceRecords: 1 },
      { fines: 1 },
      { fuelEntries: 1 },
    ]) {
      const { service, tenant } = build({ counts });

      await assert.rejects(
        withTenant(() => service.setBaseCurrency('user-admin', 'TRY')),
        (error: unknown) => {
          assert.ok(error instanceof ConflictException);
          assert.equal(
            (error.getResponse() as { code?: string }).code,
            'tenant_base_currency_locked',
          );
          return true;
        },
      );
      // Eski tutarlar YENIDEN ETIKETLENMEDI.
      assert.equal(tenant.baseCurrency, 'EUR');
    }
  });

  it('accepts a no-op write even when locked', async () => {
    const { service, audits } = build({ counts: { fines: 3 } });

    const settings = await withTenant(() => service.setBaseCurrency('user-admin', 'EUR'));

    assert.equal(settings.baseCurrency, 'EUR');
    // Degisiklik olmadigi icin denetime olay DUSMEZ.
    assert.equal(audits.length, 0);
  });

  it('refuses an unsupported currency', async () => {
    const { service } = build();
    await assert.rejects(withTenant(() => service.setBaseCurrency('user-admin', 'XYZ')));
  });
});

describe('tenant settings roles', () => {
  it('lets accounting read but only admin and boss write', async () => {
    const { ROLES_KEY } = await import('../decorators/roles.decorator');
    const { TenantSettingsController } = await import('../../tenant/tenant-settings.controller');

    const controllerRoles = Reflect.getMetadata(ROLES_KEY, TenantSettingsController) as string[];
    // OKUMA: muhasebe hangi para biriminde calistigini gormeli.
    assert.ok(controllerRoles.includes('accounting'));
    // OFFICE mali ayara hic giremez.
    assert.equal(controllerRoles.includes('office'), false);

    const writeHandler = Reflect.get(TenantSettingsController.prototype as object, 'setCurrency');
    const writeRoles = Reflect.getMetadata(ROLES_KEY, writeHandler as object) as string[];
    assert.deepEqual([...writeRoles].sort(), ['admin', 'boss']);
    // YAZMA: muhasebe DEGISTIREMEZ.
    assert.equal(writeRoles.includes('accounting'), false);
  });
});
