import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FuelCompatibilitySource, FuelProductType, FuelProductUsage } from '@prisma/client';
import { VehicleFuelCompatibilityService } from './vehicle-fuel-compatibility.service';

/**
 * Ofis tarafinin uyumluluk yazimi.
 *
 * Sinanan davranislar: ADBLUE/ADDITIVE kurali, cift kayit engeli, setin
 * TRANSACTION icinde tamamen degistirilmesi ve baska kiracinin aracina
 * yazilamamasi.
 */

type Row = {
  productType: FuelProductType;
  usageType: FuelProductUsage;
  approved: boolean;
  source: FuelCompatibilitySource;
  verifiedAt: Date | null;
};

function buildService(options: {
  vehicle?: { id: string; plateNumber: string } | null;
  existing?: Row[];
} = {}) {
  const vehicle = options.vehicle === undefined ? { id: 'veh-1', plateNumber: 'DU-AB 123' } : options.vehicle;
  let rows: Row[] = [...(options.existing ?? [])];

  /** Transaction icinde kac kez silme/yazma yapildigini kaydeder. */
  const operations: string[] = [];
  let transactionDepth = 0;

  const delegate = {
    findMany: async ({ select }: { select?: Record<string, boolean> } = {}) =>
      rows.map((row, index) => {
        const full = {
          id: `cmp-${index}`,
          productType: row.productType,
          usageType: row.usageType,
          approved: row.approved,
          source: row.source,
          verifiedAt: row.verifiedAt,
          createdAt: new Date('2026-08-12T08:00:00.000Z'),
          updatedAt: new Date('2026-08-12T08:00:00.000Z'),
        };
        if (!select) return full;
        return Object.fromEntries(
          Object.keys(select).map((key) => [key, (full as Record<string, unknown>)[key]]),
        );
      }),
  };

  const tx = {
    vehicleFuelCompatibility: {
      deleteMany: async () => {
        assert.equal(transactionDepth > 0, true, 'deleteMany must run inside the transaction');
        operations.push('deleteMany');
        const count = rows.length;
        rows = [];
        return { count };
      },
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        assert.equal(transactionDepth > 0, true, 'createMany must run inside the transaction');
        operations.push('createMany');

        // Gercek benzersiz indeksi taklit et: ayni arac/urun/kullanim iki kez
        // yazilamaz. Servis bunu daha once yakalamazsa test burada patlar.
        const seen = new Set<string>();
        for (const entry of data) {
          const key = `${String(entry.productType)}:${String(entry.usageType)}`;
          if (seen.has(key)) {
            throw new Error('Unique constraint failed on vehicle_fuel_compatibility');
          }
          seen.add(key);
        }

        rows = data.map((entry) => ({
          productType: entry.productType as FuelProductType,
          usageType: entry.usageType as FuelProductUsage,
          approved: entry.approved as boolean,
          source: entry.source as FuelCompatibilitySource,
          verifiedAt: (entry.verifiedAt as Date | null) ?? null,
        }));
        return { count: data.length };
      },
    },
  };

  const prisma = {
    vehicle: {
      findFirst: async () => vehicle,
    },
    vehicleFuelCompatibility: delegate,
    $transaction: async (callback: (client: unknown) => Promise<unknown>) => {
      transactionDepth += 1;
      try {
        return await callback(tx);
      } finally {
        transactionDepth -= 1;
      }
    },
  };

  const auditEvents: Array<{ action: string; entityId?: string }> = [];
  const audit = {
    logAction: async (params: { action: string; entityId?: string }) => {
      auditEvents.push(params);
    },
  };

  const service = new VehicleFuelCompatibilityService(prisma as never, audit as never);
  return { service, operations, auditEvents, currentRows: () => rows };
}

const DIESEL_ENTRY = {
  productType: FuelProductType.DIESEL,
  usageType: FuelProductUsage.PRIMARY,
  source: FuelCompatibilitySource.MANUFACTURER,
};

describe('VehicleFuelCompatibilityService — validation', () => {
  it('rejects AdBlue recorded as a primary fuel', async () => {
    const { service } = buildService();

    await assert.rejects(
      () =>
        service.replaceForVehicle(
          'veh-1',
          [{ ...DIESEL_ENTRY, productType: FuelProductType.ADBLUE }],
          'user-1',
        ),
      (error: { response?: { code?: string } }) => {
        assert.equal(error.response?.code, 'adblue_must_be_additive');
        return true;
      },
    );
  });

  it('accepts AdBlue as an additive', async () => {
    const { service, currentRows } = buildService();

    await service.replaceForVehicle(
      'veh-1',
      [
        DIESEL_ENTRY,
        {
          productType: FuelProductType.ADBLUE,
          usageType: FuelProductUsage.ADDITIVE,
          source: FuelCompatibilitySource.MANUFACTURER,
        },
      ],
      'user-1',
    );

    assert.equal(currentRows().length, 2);
  });

  it('rejects ADDITIVE usage for a real fuel', async () => {
    // Dizeli ADDITIVE isaretlemek onu istasyon filtresinden sessizce dusururdu.
    const { service } = buildService();

    await assert.rejects(
      () =>
        service.replaceForVehicle(
          'veh-1',
          [{ ...DIESEL_ENTRY, usageType: FuelProductUsage.ADDITIVE }],
          'user-1',
        ),
      (error: { response?: { code?: string } }) => {
        assert.equal(error.response?.code, 'additive_usage_only_for_adblue');
        return true;
      },
    );
  });

  it('refuses a duplicate vehicle/product/usage pair before it reaches the database', async () => {
    const { service, operations } = buildService();

    await assert.rejects(
      () => service.replaceForVehicle('veh-1', [DIESEL_ENTRY, DIESEL_ENTRY], 'user-1'),
      (error: { response?: { code?: string } }) => {
        assert.equal(error.response?.code, 'duplicate_fuel_compatibility_entry');
        return true;
      },
    );

    // Dogrulama yazmadan once: transaction hic acilmamali.
    assert.deepEqual(operations, []);
  });

  it('allows the same product under two different usage types', async () => {
    const { service, currentRows } = buildService();

    await service.replaceForVehicle(
      'veh-1',
      [
        DIESEL_ENTRY,
        { ...DIESEL_ENTRY, usageType: FuelProductUsage.ALTERNATIVE },
      ],
      'user-1',
    );

    assert.equal(currentRows().length, 2);
  });
});

describe('VehicleFuelCompatibilityService — replace semantics', () => {
  it('replaces the whole set inside one transaction', async () => {
    const { service, operations, currentRows } = buildService({
      existing: [
        {
          productType: FuelProductType.SUPER_E5,
          usageType: FuelProductUsage.PRIMARY,
          approved: true,
          source: FuelCompatibilitySource.ADMIN,
          verifiedAt: null,
        },
      ],
    });

    await service.replaceForVehicle('veh-1', [DIESEL_ENTRY], 'user-1');

    assert.deepEqual(operations, ['deleteMany', 'createMany']);
    assert.deepEqual(
      currentRows().map((row) => row.productType),
      [FuelProductType.DIESEL],
    );
  });

  it('does not create duplicates when the same set is written twice', async () => {
    const { service, currentRows } = buildService();

    await service.replaceForVehicle('veh-1', [DIESEL_ENTRY], 'user-1');
    await service.replaceForVehicle('veh-1', [DIESEL_ENTRY], 'user-1');

    assert.equal(currentRows().length, 1);
  });

  it('accepts an empty set as "compatibility undefined again"', async () => {
    const { service, operations, currentRows } = buildService({
      existing: [
        {
          productType: FuelProductType.DIESEL,
          usageType: FuelProductUsage.PRIMARY,
          approved: true,
          source: FuelCompatibilitySource.ADMIN,
          verifiedAt: null,
        },
      ],
    });

    await service.replaceForVehicle('veh-1', [], 'user-1');

    assert.deepEqual(operations, ['deleteMany']);
    assert.deepEqual(currentRows(), []);
  });

  it('defaults approved to true but keeps an explicit false', async () => {
    const { service, currentRows } = buildService();

    await service.replaceForVehicle(
      'veh-1',
      [
        DIESEL_ENTRY,
        {
          productType: FuelProductType.HVO100,
          usageType: FuelProductUsage.ALTERNATIVE,
          approved: false,
          source: FuelCompatibilitySource.MANUFACTURER,
        },
      ],
      'user-1',
    );

    const byProduct = new Map(currentRows().map((row) => [row.productType, row.approved]));
    assert.equal(byProduct.get(FuelProductType.DIESEL), true);
    assert.equal(byProduct.get(FuelProductType.HVO100), false);
  });

  it('writes an audit event through the existing audit service', async () => {
    const { service, auditEvents } = buildService();

    await service.replaceForVehicle('veh-1', [DIESEL_ENTRY], 'user-42');

    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0]!.action, 'vehicle.fuel_compatibility_replaced');
    assert.equal(auditEvents[0]!.entityId, 'veh-1');
  });

  it('exposes only approved PRIMARY/ALTERNATIVE products as compatibleProducts', async () => {
    const { service } = buildService({
      existing: [
        {
          productType: FuelProductType.DIESEL,
          usageType: FuelProductUsage.PRIMARY,
          approved: true,
          source: FuelCompatibilitySource.MANUFACTURER,
          verifiedAt: null,
        },
        {
          productType: FuelProductType.ADBLUE,
          usageType: FuelProductUsage.ADDITIVE,
          approved: true,
          source: FuelCompatibilitySource.MANUFACTURER,
          verifiedAt: null,
        },
        {
          productType: FuelProductType.HVO100,
          usageType: FuelProductUsage.ALTERNATIVE,
          approved: false,
          source: FuelCompatibilitySource.MANUFACTURER,
          verifiedAt: null,
        },
      ],
    });

    const response = await service.getForVehicle('veh-1');

    assert.deepEqual(response.compatibleProducts, [FuelProductType.DIESEL]);
    // Ham kayitlar yine gorunur — ofis AdBlue'yu ve reddedilen HVO'yu gormeli.
    assert.equal(response.entries.length, 3);
  });
});

describe('VehicleFuelCompatibilityService — tenant isolation', () => {
  it('cannot read another tenant vehicle', async () => {
    // Kapsamli istemci baska kiracinin aracini dondurmez -> vehicle_not_found.
    const { service } = buildService({ vehicle: null });

    await assert.rejects(
      () => service.getForVehicle('veh-of-tenant-b'),
      (error: { status?: number; response?: { code?: string } }) => {
        assert.equal(error.status, 404);
        assert.equal(error.response?.code, 'vehicle_not_found');
        return true;
      },
    );
  });

  it('cannot write to another tenant vehicle', async () => {
    const { service, operations } = buildService({ vehicle: null });

    await assert.rejects(
      () => service.replaceForVehicle('veh-of-tenant-b', [DIESEL_ENTRY], 'user-1'),
      (error: { response?: { code?: string } }) => {
        assert.equal(error.response?.code, 'vehicle_not_found');
        return true;
      },
    );

    assert.deepEqual(operations, []);
  });
});
