import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// prisma/seed.ts ile ayni koruma: uretimde asla calismaz.
if (process.env.NODE_ENV === 'production') {
  throw new Error('Wiping is disabled in production.');
}

// Yanlislikla calistirmaya karsi ikinci kapi.
if (!process.argv.includes('--yes')) {
  console.error(
    'Bu script tum is verisini siler (hesaplar ve kiraci yapilandirmasi korunur).\n' +
      'Devam etmek icin --yes ekle:  node scripts/wipe-demo-data.mjs --yes',
  );
  process.exit(1);
}

/** Korunanlar: giris hesaplari ve kiraci yapilandirmasi. Geri kalan her sey is verisi. */
const KEEP = new Set([
  'Tenant',
  'User',
  'RefreshToken',
  'TenantBillingProfile',
  'TenantSubscription',
  'ChecklistTemplate',
  'ChecklistTemplateItem',
]);

const models = Prisma.dmmf.datamodel.models;

/** Postgres tablo adi model adindan farkli olabilir (@@map). */
const tableOf = (model) => model.dbName ?? model.name;

async function countAll() {
  const counts = {};
  for (const model of models) {
    const key = model.name.charAt(0).toLowerCase() + model.name.slice(1);
    try {
      counts[model.name] = await prisma[key].count();
    } catch {
      // Prisma client'ta karsiligi olmayan model
    }
  }
  return counts;
}

const before = await countAll();

// Sadece gercekten var olan tablolari temizle.
const existing = new Set(
  (
    await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  ).map((row) => row.tablename),
);

const targets = models
  .filter((model) => !KEEP.has(model.name))
  .map(tableOf)
  .filter((table) => existing.has(table));

const missing = models
  .filter((model) => !KEEP.has(model.name))
  .map(tableOf)
  .filter((table) => !existing.has(table));

if (missing.length > 0) {
  console.log('Uyari — semada var, veritabaninda yok, atlandi:', missing.join(', '));
}

const tables = targets.map((table) => `"public"."${table}"`).join(', ');
await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);

// Kullanicisi olmayan saf mock kiraci kabuklari.
const droppedTenants = await prisma.tenant.deleteMany({
  where: { id: { in: ['mock-fleet-tenant', 'consumer-tenant'] } },
});

// Seed'den kalan "sample" kontrol listesi sablonu.
const droppedSample = await prisma.checklistTemplate.deleteMany({ where: { name: 'sample' } });

const after = await countAll();

console.log(`\n${targets.length} tablo temizlendi, ${KEEP.size} tablo korundu.\n`);
console.log('TABLO'.padEnd(30), 'ONCE'.padStart(7), 'SONRA'.padStart(7));
for (const model of models) {
  const name = model.name;
  if ((before[name] ?? 0) === 0 && (after[name] ?? 0) === 0) continue;
  console.log(name.padEnd(30), String(before[name]).padStart(7), String(after[name]).padStart(7));
}
console.log(`\nSilinen kiraci kabugu: ${droppedTenants.count} | silinen "sample" sablon: ${droppedSample.count}`);

await prisma.$disconnect();
