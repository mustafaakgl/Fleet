/**
 * Pilot sirket Einsatzplan CSV -> Company + Driver + CalendarEvent
 *
 * Kullanim:
 *   node import-pilot-csv.mjs "/yol/dosya.csv"            # kuru calisma, hicbir sey yazmaz
 *   node import-pilot-csv.mjs "/yol/dosya.csv" --commit   # gercekten yazar
 *
 * Idempotent: ayni CSV iki kez calistirilirsa kayit cogalmaz.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const [, , csvPath, ...flags] = process.argv;
const COMMIT = flags.includes('--commit');
const TENANT_ID = process.env.PILOT_TENANT_ID ?? 'default-tenant';

if (!csvPath) {
  console.error('Kullanim: node import-pilot-csv.mjs "<csv yolu>" [--commit]');
  process.exit(1);
}

/** Tirnakli, noktali virgulle ayrilmis satiri alanlara boler. */
function parseLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ';' && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const YEAR = 2026;
const MONTH = 5; // Mai
const utcDate = (day) => new Date(Date.UTC(YEAR, MONTH - 1, day));
const isWeekend = (day) => [0, 6].includes(utcDate(day).getUTCDay());

const raw = readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
const lines = raw.split(/\r?\n/).filter((l) => l.trim());
const rows = lines.slice(1).map(parseLine).filter((r) => (r[1] ?? '').trim());

const VALID = new Set(['UT', 'KT', 'FT']);
const warnings = [];

/**
 * CSV'de 44 satirin 43'u "Soyad Ad" duzeninde. Ters yazilmis istisnalar burada.
 * Yanlissa duzeltmek icin tek satir: dogru { firstName, lastName } yaz.
 */
const NAME_OVERRIDES = {
  'Isabelle Albrecht': { firstName: 'Isabelle', lastName: 'Albrecht' },
};

/** "Soyad Ad" -> ilk kelime soyad, kalani ad. */
function splitName(full) {
  const key = full.trim();
  if (NAME_OVERRIDES[key]) return NAME_OVERRIDES[key];
  const parts = key.split(/\s+/);
  if (parts.length === 1) return { lastName: parts[0], firstName: '' };
  return { lastName: parts[0], firstName: parts.slice(1).join(' ') };
}

const people = [];
for (const row of rows) {
  const company = (row[0] ?? '').trim();
  const fullName = (row[1] ?? '').trim();
  const { firstName, lastName } = splitName(fullName);

  const events = [];
  for (let day = 1; day <= 31; day++) {
    const code = (row[day + 1] ?? '').trim();
    if (!code) continue;
    if (!VALID.has(code)) {
      warnings.push(`${fullName}: ${day}. gun bilinmeyen kod "${code}" — atlandi`);
      continue;
    }
    if (isWeekend(day)) {
      warnings.push(`${fullName}: ${day}. Mai hafta sonu ama "${code}" yazilmis — atlandi`);
      continue;
    }
    events.push({ day, code });
  }

  if (events.length === 0) warnings.push(`${fullName}: hic takvim kaydi yok`);
  people.push({ company, fullName, firstName, lastName, events });
}

const companies = [...new Set(people.map((p) => p.company))].sort();

console.log(`CSV: ${people.length} kisi, ${companies.length} firma, ${people.reduce((n, p) => n + p.events.length, 0)} takvim kaydi`);
console.log(`Hedef kiraci: ${TENANT_ID}`);
console.log(`Mod: ${COMMIT ? 'YAZMA (--commit)' : 'KURU CALISMA — hicbir sey yazilmayacak'}\n`);

if (warnings.length) {
  console.log('UYARILAR:');
  for (const w of warnings) console.log('  !', w);
  console.log();
}

if (!COMMIT) {
  console.log('Firmalar:', companies.join(', '));
  console.log('\nOrnek 3 surucu:');
  for (const p of people.slice(0, 3)) {
    console.log(`  ${p.company.padEnd(14)} ${p.lastName} / ${p.firstName}  (${p.events.length} kayit)`);
  }
  console.log('\nYazmak icin --commit ekle.');
  await prisma.$disconnect();
  process.exit(0);
}

// --- Firmalar ---
const companyIdByName = new Map();
for (const name of companies) {
  const row = await prisma.company.upsert({
    where: { tenantId_name: { tenantId: TENANT_ID, name } },
    update: {},
    create: { tenantId: TENANT_ID, name },
  });
  companyIdByName.set(name, row.id);
}
console.log(`Firma: ${companyIdByName.size} kayit hazir.`);

// --- Suruculer ---
let driverCreated = 0;
let driverUpdated = 0;
const driverIdByName = new Map();
for (const [index, p] of people.entries()) {
  const employeeNumber = `P-${String(index + 1).padStart(3, '0')}`;
  const existing = await prisma.driver.findUnique({
    where: { tenantId_employeeNumber: { tenantId: TENANT_ID, employeeNumber } },
  });
  const data = {
    firstName: p.firstName,
    lastName: p.lastName,
    companyId: companyIdByName.get(p.company) ?? null,
  };
  const row = existing
    ? await prisma.driver.update({ where: { id: existing.id }, data })
    : await prisma.driver.create({
        data: { tenantId: TENANT_ID, employeeNumber, ...data },
      });
  existing ? driverUpdated++ : driverCreated++;
  driverIdByName.set(p.fullName, row.id);
}
console.log(`Surucu: ${driverCreated} yeni, ${driverUpdated} guncellendi.`);

// --- Takvim ---
// Ayni ay icin onceki iceri aktarimi temizle, sonra yeniden yaz (idempotent).
const driverIds = [...driverIdByName.values()];
const removed = await prisma.calendarEvent.deleteMany({
  where: {
    tenantId: TENANT_ID,
    driverId: { in: driverIds },
    date: { gte: utcDate(1), lte: utcDate(31) },
    source: 'manual',
  },
});

const events = people.flatMap((p) =>
  p.events.map((e) => ({
    tenantId: TENANT_ID,
    driverId: driverIdByName.get(p.fullName),
    date: utcDate(e.day),
    status: e.code,
    source: 'manual',
  })),
);
const written = await prisma.calendarEvent.createMany({ data: events });
console.log(`Takvim: ${removed.count} eski kayit silindi, ${written.count} kayit yazildi.`);

console.log('\nTamamlandi.');
await prisma.$disconnect();
