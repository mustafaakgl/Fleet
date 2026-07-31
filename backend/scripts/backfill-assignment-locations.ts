/// <reference types="node" />

/**
 * Mevcut gorevlerin adres metinlerini Location kayitlarina baglar.
 *
 * Calistirma:
 *   npx ts-node --transpile-only scripts/backfill-assignment-locations.ts [secenekler]
 *
 * Secenekler:
 *   --limit <n>          en fazla n gorev isle (varsayilan: hepsi)
 *   --tenant <id>        sadece bu tenant (varsayilan: tum tenantlar)
 *   --delay <ms>         geocode cagrilari arasi bekleme (varsayilan 1000)
 *   --skip-access-check  kamyon erisim kontrolunu atla (hizli ilk gecis)
 *   --dry-run            hicbir sey yazma, sadece ne yapilacagini raporla
 *
 * Idempotent: zaten bagli gorevler atlanir, tekrar calistirmak guvenlidir.
 *
 * Hiz notu: public Photon'a nazik davranmak icin varsayilan olarak cagri basina
 * 1 sn beklenir. Tekrarlayan adresler Location tablosunda paylasildigindan
 * gercek geocode sayisi gorev sayisindan cok daha azdir. Self-host Photon
 * kullaniliyorsa --delay 0 verilebilir.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { GeocodingService } from '../src/routing/geocoding.service';
import { RoutingCacheService } from '../src/routing/routing-cache.service';
import { RoutingService } from '../src/routing/routing.service';
import { ValhallaClient } from '../src/routing/valhalla.client';
import { TenantContext } from '../src/tenant/tenant-context';

interface Options {
  limit: number | null;
  tenantId: string | null;
  delayMs: number;
  skipAccessCheck: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    limit: null,
    tenantId: null,
    delayMs: 1000,
    skipAccessCheck: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('--limit pozitif bir sayi olmali');
      }
      options.limit = value;
      i += 1;
    } else if (arg === '--tenant') {
      options.tenantId = argv[i + 1] ?? null;
      if (!options.tenantId) throw new Error('--tenant bir id bekliyor');
      i += 1;
    } else if (arg === '--delay') {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error('--delay negatif olmayan bir sayi olmali');
      }
      options.delayMs = value;
      i += 1;
    } else if (arg === '--skip-access-check') {
      options.skipAccessCheck = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else {
      throw new Error(`Bilinmeyen secenek: ${arg}`);
    }
  }

  return options;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface TenantStats {
  assignmentsScanned: number;
  assignmentsLinked: number;
  locationsCreated: number;
  geocodeCalls: number;
  geocodeFailed: number;
  truckUnreachable: number;
}

async function backfillTenant(
  tenantId: string,
  prisma: PrismaService,
  routing: RoutingService,
  options: Options,
): Promise<TenantStats> {
  const stats: TenantStats = {
    assignmentsScanned: 0,
    assignmentsLinked: 0,
    locationsCreated: 0,
    geocodeCalls: 0,
    geocodeFailed: 0,
    truckUnreachable: 0,
  };

  await TenantContext.run(tenantId, async () => {
    const pending = await prisma.assignment.findMany({
      where: {
        OR: [{ pickupLocationId: null }, { deliveryLocationId: null }],
      },
      select: { id: true },
      orderBy: { workDate: 'desc' },
      ...(options.limit ? { take: options.limit } : {}),
    });

    stats.assignmentsScanned = pending.length;
    if (pending.length === 0) {
      return;
    }

    const locationsBefore = await prisma.location.count();

    for (const [index, assignment] of pending.entries()) {
      if (options.dryRun) {
        continue;
      }

      let geocodeCalls = 0;
      try {
        const result = await routing.linkAssignmentLocations(assignment.id, {
          skipTruckAccessCheck: options.skipAccessCheck,
        });
        geocodeCalls = result.geocodeCalls;
        stats.geocodeCalls += geocodeCalls;
        stats.assignmentsLinked += 1;
      } catch (error) {
        console.error(
          `  gorev ${assignment.id} baglanamadi: ${
            error instanceof Error ? error.message : 'bilinmeyen hata'
          }`,
        );
      }

      if ((index + 1) % 100 === 0) {
        console.log(
          `  ${index + 1}/${pending.length} gorev islendi (${stats.geocodeCalls} geocode cagrisi)`,
        );
      }

      // Yalnizca geocoder'a gercekten gidildiyse bekle. Adresler gorevler
      // arasinda paylasildigi icin cagrilarin buyuk cogunlugu Location
      // tablosundan karsilanir; her goreve bekleme koymak islemi gereksiz
      // yere dakikalarca uzatir.
      if (geocodeCalls > 0 && options.delayMs > 0) {
        await sleep(options.delayMs * geocodeCalls);
      }
    }

    const locationsAfter = await prisma.location.count();
    stats.locationsCreated = locationsAfter - locationsBefore;

    stats.geocodeFailed = await prisma.location.count({ where: { latitude: null } });
    stats.truckUnreachable = await prisma.location.count({
      where: { truckAccess: 'unreachable' },
    });
  });

  return stats;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const prisma = new PrismaService();
  const cache = new RoutingCacheService();
  const geocoding = new GeocodingService();
  const valhalla = new ValhallaClient();
  const routing = new RoutingService(prisma, valhalla, geocoding, cache);

  console.log('Assignment -> Location backfill');
  console.log(
    `  secenekler: limit=${options.limit ?? 'yok'} delay=${options.delayMs}ms ` +
      `accessCheck=${options.skipAccessCheck ? 'kapali' : 'acik'} dryRun=${options.dryRun}`,
  );

  const health = await routing.health();
  if (!health.available) {
    console.warn(
      `  UYARI: Valhalla erisilemiyor (${health.message}). Geocode yapilir ama ` +
        'kamyon erisim kontrolu check_failed olarak isaretlenir.',
    );
  } else {
    console.log(`  Valhalla v${health.version} hazir`);
  }

  if (!geocoding.selfHosted) {
    console.warn(
      '  UYARI: public Photon kullaniliyor. Toplu islem icin self-host onerilir ' +
        '(PHOTON_URL). Adil kullanim kosullarina dikkat.',
    );
  }

  const tenants = options.tenantId
    ? [{ id: options.tenantId }]
    : await prisma.unscoped.tenant.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } });

  const totals: TenantStats = {
    assignmentsScanned: 0,
    assignmentsLinked: 0,
    locationsCreated: 0,
    geocodeCalls: 0,
    geocodeFailed: 0,
    truckUnreachable: 0,
  };

  try {
    for (const tenant of tenants) {
      console.log(`\ntenant ${tenant.id}`);
      const stats = await backfillTenant(tenant.id, prisma, routing, options);
      console.log(
        `  taranan=${stats.assignmentsScanned} baglanan=${stats.assignmentsLinked} ` +
          `yeni Location=${stats.locationsCreated}`,
      );
      if (stats.geocodeFailed > 0) {
        console.log(`  koordinati olmayan Location: ${stats.geocodeFailed} (yeniden denenebilir)`);
      }
      if (stats.truckUnreachable > 0) {
        console.log(
          `  KAMYONA KAPALI Location: ${stats.truckUnreachable} — bu adresler tur ` +
            'optimizasyonunu cokertir, operasyonun duzeltmesi gerekir',
        );
      }

      totals.assignmentsScanned += stats.assignmentsScanned;
      totals.assignmentsLinked += stats.assignmentsLinked;
      totals.locationsCreated += stats.locationsCreated;
      totals.truckUnreachable += stats.truckUnreachable;
    }

    console.log(
      `\ntoplam: taranan=${totals.assignmentsScanned} baglanan=${totals.assignmentsLinked} ` +
        `yeni Location=${totals.locationsCreated} kamyona-kapali=${totals.truckUnreachable}`,
    );
  } finally {
    await cache.onModuleDestroy();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('backfill basarisiz:', error);
  process.exit(1);
});
