#!/usr/bin/env node
/**
 * Demo fill seed — populates modules that are empty in default-tenant so every
 * page shows data: Defects, Fines, Driver Licenses + License Checks,
 * Vehicle Equipment, Maintenance Rules (+ status logs).
 *
 * Idempotent: uses fixed ids (demo-fill-*) with upsert; safe to re-run.
 *
 * Usage: node scripts/seed-demo-fill.mjs
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = 'default-tenant';

function daysFromNow(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function at(date, hours, minutes = 0) {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function dec(value) {
  return new Prisma.Decimal(Number(value).toFixed(3));
}

// Deterministic pseudo-random so re-runs stay stable.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

async function main() {
  const [drivers, vehicles, adminUser] = await Promise.all([
    prisma.driver.findMany({
      where: { tenantId: TENANT_ID, status: 'active' },
      orderBy: { createdAt: 'asc' },
      take: 16,
      select: { id: true, firstName: true, lastName: true, licenseNumber: true },
    }),
    prisma.vehicle.findMany({
      where: { tenantId: TENANT_ID, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 16,
      select: { id: true, plateNumber: true, brand: true, model: true },
    }),
    prisma.user.findFirst({
      where: { tenantId: TENANT_ID, role: 'admin' },
      select: { id: true },
    }),
  ]);

  if (drivers.length < 6 || vehicles.length < 6) {
    throw new Error(
      `Not enough base data in ${TENANT_ID} (drivers=${drivers.length}, vehicles=${vehicles.length}). Run prisma db seed first.`,
    );
  }

  const d = (i) => drivers[i % drivers.length];
  const v = (i) => vehicles[i % vehicles.length];

  // ── 1. Driver licenses ────────────────────────────────────────────────
  const licenseClassSets = [
    ['B'],
    ['B', 'BE'],
    ['B', 'C1', 'C1E'],
    ['B', 'C', 'CE'],
    ['B', 'C', 'CE', 'T'],
  ];
  const authorities = [
    'Landratsamt München',
    'Bürgeramt Berlin-Mitte',
    'Straßenverkehrsamt Köln',
    'Landratsamt Stuttgart',
  ];
  let licenses = 0;
  for (let i = 0; i < 12; i += 1) {
    const driver = d(i);
    // variety: #0 expired, #1-2 expiring soon, rest healthy
    const expiresIn = i === 0 ? -20 : i <= 2 ? 25 + i * 10 : 365 + i * 90;
    await prisma.driverLicense.upsert({
      where: { id: `demo-fill-lic-${i}` },
      update: {},
      create: {
        id: `demo-fill-lic-${i}`,
        tenantId: TENANT_ID,
        driverId: driver.id,
        licenseNumber: driver.licenseNumber ?? `B${String(72031400 + i * 137)}`,
        classes: licenseClassSets[i % licenseClassSets.length],
        issuedAt: daysFromNow(-(365 * 4 + i * 60)),
        expiresAt: daysFromNow(expiresIn),
        issuingAuthority: authorities[i % authorities.length],
        nextCheckDueAt: daysFromNow(i < 4 ? 7 + i * 5 : 90 + i * 10),
        lastApprovedCheckAt: daysFromNow(-(170 + i * 3)),
      },
    });
    licenses += 1;
  }

  // ── 2. License checks ─────────────────────────────────────────────────
  const checkPlans = [
    { type: 'initial', status: 'approved', daysAgo: 178 },
    { type: 'periodic', status: 'approved', daysAgo: 95 },
    { type: 'periodic', status: 'approved', daysAgo: 12 },
    { type: 'periodic', status: 'pending', daysAgo: 2 },
    { type: 'periodic', status: 'pending', daysAgo: 0 },
    {
      type: 'periodic',
      status: 'rejected',
      daysAgo: 6,
      rejectionReason: 'Foto unscharf — Vorderseite erneut hochladen.',
    },
  ];
  let checks = 0;
  for (let i = 0; i < 12; i += 1) {
    const plan = checkPlans[i % checkPlans.length];
    await prisma.licenseCheck.upsert({
      where: { id: `demo-fill-check-${i}` },
      update: {},
      create: {
        id: `demo-fill-check-${i}`,
        tenantId: TENANT_ID,
        driverId: d(i).id,
        driverLicenseId: `demo-fill-lic-${i}`,
        checkDate: daysFromNow(-plan.daysAgo),
        checkType: plan.type,
        status: plan.status,
        verifiedById: plan.status === 'pending' ? null : (adminUser?.id ?? null),
        verifiedAt: plan.status === 'pending' ? null : daysFromNow(-plan.daysAgo),
        rejectionReason: plan.rejectionReason ?? null,
        dueAt: daysFromNow(-plan.daysAgo - 7),
        notes: plan.type === 'initial' ? 'Erstkontrolle bei Einstellung.' : null,
      },
    });
    checks += 1;
  }

  // ── 3. Defects (+ status logs) ────────────────────────────────────────
  const defectPlans = [
    { sev: 'kritisch', status: 'offen', title: 'Bremsen quietschen stark', desc: 'Beim Bremsen ab 50 km/h lautes Quietschen vorne rechts, Bremsweg fühlt sich länger an.' },
    { sev: 'kritisch', status: 'in_reparatur', title: 'Motorkontrollleuchte an', desc: 'MKL leuchtet dauerhaft, Motor ruckelt im Leerlauf.', company: 'Bosch Service Neumann' },
    { sev: 'mittel', status: 'offen', title: 'Klimaanlage kühlt nicht', desc: 'Klimaanlage bläst nur warme Luft, vermutlich Kältemittel leer.' },
    { sev: 'mittel', status: 'in_reparatur', title: 'Riss in Windschutzscheibe', desc: 'Steinschlag mit ca. 15 cm Riss auf Beifahrerseite, wächst weiter.', company: 'Carglass Berlin' },
    { sev: 'mittel', status: 'behoben', title: 'Rücklicht defekt', desc: 'Rücklicht links ohne Funktion, Birne vermutlich durchgebrannt.' },
    { sev: 'gering', status: 'offen', title: 'Scheibenwaschanlage schwach', desc: 'Düse fahrerseitig verstopft, Sprühbild ungleichmäßig.' },
    { sev: 'gering', status: 'behoben', title: 'Innenbeleuchtung flackert', desc: 'Innenraumlicht flackert bei Türkontakt.' },
    { sev: 'gering', status: 'bestaetigt', title: 'Kratzer Stoßstange hinten', desc: 'Oberflächlicher Kratzer ca. 10 cm an der hinteren Stoßstange.' },
    { sev: 'kritisch', status: 'offen', title: 'Reifen Profiltiefe unter 3mm', desc: 'Vorderreifen beidseitig nahe Verschleißgrenze, Wechsel dringend.' },
    { sev: 'mittel', status: 'offen', title: 'Standheizung ohne Funktion', desc: 'Standheizung startet nicht, Fehlercode im Display.' },
  ];
  let defects = 0;
  for (let i = 0; i < defectPlans.length; i += 1) {
    const plan = defectPlans[i];
    const defectId = `demo-fill-defect-${i}`;
    await prisma.defect.upsert({
      where: { id: defectId },
      update: {},
      create: {
        id: defectId,
        tenantId: TENANT_ID,
        vehicleId: v(i).id,
        reportedByDriverId: d(i).id,
        source: i % 3 === 0 ? 'departure_check' : 'manual_report',
        title: plan.title,
        description: plan.desc,
        severity: plan.sev,
        status: plan.status,
        photoStoredPaths: [],
        repairCompany: plan.company ?? null,
        estimatedRepairDate: plan.status === 'in_reparatur' ? daysFromNow(5 + i) : null,
        confirmationDriverId: plan.status === 'bestaetigt' ? d(i).id : null,
        confirmedAt: plan.status === 'bestaetigt' ? daysFromNow(-1) : null,
        createdAt: daysFromNow(-(2 + i * 3)),
      },
    });
    const transitions = { offen: [], in_reparatur: ['in_reparatur'], behoben: ['in_reparatur', 'behoben'], bestaetigt: ['in_reparatur', 'behoben', 'bestaetigt'] }[plan.status];
    let from = 'offen';
    for (let s = 0; s < transitions.length; s += 1) {
      await prisma.defectStatusLog.upsert({
        where: { id: `demo-fill-defect-log-${i}-${s}` },
        update: {},
        create: {
          id: `demo-fill-defect-log-${i}-${s}`,
          tenantId: TENANT_ID,
          defectId,
          fromStatus: from,
          toStatus: transitions[s],
          changedByUserId: adminUser?.id ?? null,
          note: transitions[s] === 'in_reparatur' ? `Werkstatttermin vereinbart (${plan.company ?? 'Hauswerkstatt'}).` : null,
          repairCompany: plan.company ?? null,
          createdAt: daysFromNow(-(1 + i * 2) + s),
        },
      });
      from = transitions[s];
    }
    defects += 1;
  }

  // ── 4. Fines (+ status logs) ──────────────────────────────────────────
  const finePlans = [
    { cat: 'speed', type: 'Geschwindigkeitsüberschreitung innerorts (21 km/h)', loc: 'Berlin, Torstraße 112', amount: 115, status: 'neu', match: 'unmatched' },
    { cat: 'speed', type: 'Geschwindigkeitsüberschreitung außerorts (16 km/h)', loc: 'A9 München–Nürnberg, km 34', amount: 70, status: 'fahrer_zugeordnet', match: 'auto' },
    { cat: 'parking', type: 'Parken im eingeschränkten Halteverbot', loc: 'Hamburg, Mönckebergstraße 7', amount: 25, status: 'bezahlt', match: 'manual' },
    { cat: 'red_light', type: 'Rotlichtverstoß (unter 1 Sekunde)', loc: 'Köln, Aachener Straße / Gürtel', amount: 90, status: 'fahrer_benachrichtigt', match: 'auto' },
    { cat: 'distance', type: 'Abstandsunterschreitung (weniger als 5/10)', loc: 'A3 Frankfurt, km 112', amount: 75, status: 'widerspruch', match: 'manual' },
    { cat: 'parking', type: 'Parken auf Gehweg', loc: 'München, Leopoldstraße 44', amount: 55, status: 'neu', match: 'unmatched' },
    { cat: 'speed', type: 'Geschwindigkeitsüberschreitung innerorts (12 km/h)', loc: 'Stuttgart, Königstraße 21', amount: 50, status: 'abgeschlossen', match: 'auto' },
    { cat: 'other', type: 'Handy am Steuer', loc: 'Düsseldorf, Kö-Bogen', amount: 100, status: 'fahrer_zugeordnet', match: 'manual' },
    { cat: 'speed', type: 'Geschwindigkeitsüberschreitung außerorts (26 km/h)', loc: 'B10 Karlsruhe, km 8', amount: 150, status: 'fahrer_benachrichtigt', match: 'auto' },
    { cat: 'parking', type: 'Parken vor Feuerwehrzufahrt', loc: 'Leipzig, Prager Straße 3', amount: 65, status: 'bezahlt', match: 'manual' },
  ];
  let fines = 0;
  for (let i = 0; i < finePlans.length; i += 1) {
    const plan = finePlans[i];
    const fineId = `demo-fill-fine-${i}`;
    const matched = plan.match !== 'unmatched';
    await prisma.fine.upsert({
      where: { id: fineId },
      update: {},
      create: {
        id: fineId,
        tenantId: TENANT_ID,
        vehicleId: v(i + 3).id,
        driverId: matched ? d(i + 2).id : null,
        matchType: plan.match,
        violationAt: daysFromNow(-(4 + i * 4)),
        violationLocation: plan.loc,
        violationType: plan.type,
        violationCategory: plan.cat,
        amount: plan.amount,
        noticeDate: daysFromNow(-(2 + i * 4)),
        paymentDueDate: daysFromNow(10 + i * 2),
        status: plan.status,
        notes: plan.status === 'widerspruch' ? 'Widerspruch eingelegt — Messprotokoll angefordert.' : null,
        driverNotifiedAt: ['fahrer_benachrichtigt', 'bezahlt', 'abgeschlossen'].includes(plan.status) ? daysFromNow(-(1 + i * 4)) : null,
        createdByUserId: adminUser?.id ?? null,
      },
    });
    const flow = { neu: [], fahrer_zugeordnet: ['fahrer_zugeordnet'], fahrer_benachrichtigt: ['fahrer_zugeordnet', 'fahrer_benachrichtigt'], bezahlt: ['fahrer_zugeordnet', 'fahrer_benachrichtigt', 'bezahlt'], widerspruch: ['fahrer_zugeordnet', 'widerspruch'], abgeschlossen: ['fahrer_zugeordnet', 'fahrer_benachrichtigt', 'bezahlt', 'abgeschlossen'] }[plan.status];
    let from = 'neu';
    for (let s = 0; s < flow.length; s += 1) {
      await prisma.fineStatusLog.upsert({
        where: { id: `demo-fill-fine-log-${i}-${s}` },
        update: {},
        create: {
          id: `demo-fill-fine-log-${i}-${s}`,
          tenantId: TENANT_ID,
          fineId,
          fromStatus: from,
          toStatus: flow[s],
          changedByUserId: adminUser?.id ?? null,
          createdAt: daysFromNow(-(1 + i * 3) + s),
        },
      });
      from = flow[s];
    }
    fines += 1;
  }

  // ── 5. Vehicle equipment ──────────────────────────────────────────────
  const equipmentCatalog = [
    { name: 'Verbandskasten DIN 13164', qty: 1 },
    { name: 'Warndreieck', qty: 1 },
    { name: 'Warnweste', qty: 2 },
    { name: 'Feuerlöscher 2kg ABC', qty: 1, serial: true },
    { name: 'Zurrgurte 2t', qty: 4 },
    { name: 'Ladungssicherungsnetz', qty: 1 },
    { name: 'Schneeketten', qty: 1, status: 'retired' },
  ];
  let equipment = 0;
  for (let i = 0; i < 12; i += 1) {
    const vehicle = v(i);
    for (let e = 0; e < 4; e += 1) {
      const item = equipmentCatalog[(i + e) % equipmentCatalog.length];
      await prisma.vehicleEquipment.upsert({
        where: { id: `demo-fill-equip-${i}-${e}` },
        update: {},
        create: {
          id: `demo-fill-equip-${i}-${e}`,
          tenantId: TENANT_ID,
          vehicleId: vehicle.id,
          name: item.name,
          quantity: item.qty,
          serialNumber: item.serial ? `FL-${2400 + i * 10 + e}` : null,
          status: item.status ?? 'active',
          notes: item.status === 'retired' ? 'Ausgemustert — Verschleiß.' : null,
        },
      });
      equipment += 1;
    }
  }

  // ── 6. Maintenance rules ──────────────────────────────────────────────
  const rulePlans = [
    { name: 'Ölwechsel', intervalKm: 30000, intervalDays: 365 },
    { name: 'Bremsen-Inspektion', intervalKm: 40000, intervalDays: null },
    { name: 'HU/AU Vorbereitung', intervalKm: null, intervalDays: 730 },
  ];
  let rules = 0;
  for (let i = 0; i < 10; i += 1) {
    const vehicle = v(i);
    for (let r = 0; r < 2; r += 1) {
      const plan = rulePlans[(i + r) % rulePlans.length];
      await prisma.fleetMaintenanceRule.upsert({
        where: { id: `demo-fill-rule-${i}-${r}` },
        update: {},
        create: {
          id: `demo-fill-rule-${i}-${r}`,
          tenantId: TENANT_ID,
          vehicleId: vehicle.id,
          name: plan.name,
          intervalKm: plan.intervalKm,
          intervalDays: plan.intervalDays,
          lastDoneAtKm: plan.intervalKm ? 120000 + i * 8000 : null,
          lastDoneAtDate: daysFromNow(-(120 + i * 15)),
        },
      });
      rules += 1;
    }
  }

  // ── 7. Fleet trips + driving events + fuel entries (last 30 days) ────
  const random = rng(4242);
  const cities = [
    { name: 'Berlin Depot → Hamburg', lat: 52.52, lng: 13.405 },
    { name: 'Berlin Depot → Leipzig', lat: 52.48, lng: 13.36 },
    { name: 'Berlin Depot → Dresden', lat: 52.5, lng: 13.42 },
  ];
  const purposes = ['business', 'business', 'business', 'commute', 'private'];
  const eventTypes = ['speeding', 'harsh_brake', 'harsh_accel', 'harsh_corner'];
  let trips = 0;
  let events = 0;
  let fuel = 0;
  let purposeLogs = 0;

  for (let day = 30; day >= 1; day -= 1) {
    const date = daysFromNow(-day);
    if (date.getDay() === 0) continue; // Sundays off
    const tripsToday = 3 + Math.floor(random() * 3);
    for (let t = 0; t < tripsToday; t += 1) {
      const idx = (day * 5 + t) % drivers.length;
      const driver = d(idx);
      const vehicle = v(idx);
      const tripId = `demo-fill-trip-${day}-${t}`;
      const startedAt = at(date, 6 + t * 3, Math.floor(random() * 45));
      const durationS = 45 * 60 + Math.floor(random() * 90 * 60);
      const endedAt = new Date(startedAt.getTime() + durationS * 1000);
      const distanceKm = 18 + random() * 160;
      const idleS = Math.floor(durationS * (0.04 + random() * 0.12));
      const avgSpeed = (distanceKm / (durationS / 3600)).toFixed(2);
      const purpose = purposes[(day + t) % purposes.length];
      const odoStart = 80000 + idx * 15000 + (30 - day) * 180;
      await prisma.fleetTrip.upsert({
        where: { id: tripId },
        update: {},
        create: {
          id: tripId,
          tenantId: TENANT_ID,
          vehicleId: vehicle.id,
          driverId: driver.id,
          source: t % 2 === 0 ? 'device' : 'phone',
          purpose,
          purposeNote: purpose === 'business' ? cities[t % cities.length].name : null,
          classifiedAt: day > 2 ? at(date, 18) : null,
          classifiedById: day > 2 ? (adminUser?.id ?? null) : null,
          odoStartKm: dec(odoStart),
          odoEndKm: dec(odoStart + distanceKm),
          startedAt,
          endedAt,
          distanceKm: dec(distanceKm),
          durationS,
          avgSpeedKmh: dec(avgSpeed),
          maxSpeedKmh: dec(Math.min(128, Number(avgSpeed) + 20 + random() * 25)),
          idleS,
          score: dec(72 + random() * 27),
          status: 'closed',
        },
      });
      trips += 1;

      // driving events for ~40% of trips
      if (random() < 0.4) {
        const eventCount = 1 + Math.floor(random() * 3);
        for (let e = 0; e < eventCount; e += 1) {
          const type = eventTypes[Math.floor(random() * eventTypes.length)];
          const base = cities[t % cities.length];
          await prisma.fleetDrivingEvent.upsert({
            where: { id: `demo-fill-event-${day}-${t}-${e}` },
            update: {},
            create: {
              id: `demo-fill-event-${day}-${t}-${e}`,
              tenantId: TENANT_ID,
              tripId,
              driverId: driver.id,
              type,
              occurredAt: new Date(startedAt.getTime() + Math.floor(random() * durationS) * 1000),
              latitude: dec(base.lat + (random() - 0.5) * 0.4),
              longitude: dec(base.lng + (random() - 0.5) * 0.6),
              value: dec(type === 'speeding' ? 95 + random() * 40 : 3 + random() * 4),
              threshold: dec(type === 'speeding' ? 80 : 3),
            },
          });
          events += 1;
        }
      }

      // purpose reclassification logs for a few trips
      if (adminUser && (day + t) % 9 === 0) {
        await prisma.fleetTripPurposeLog.upsert({
          where: { id: `demo-fill-purpose-log-${day}-${t}` },
          update: {},
          create: {
            id: `demo-fill-purpose-log-${day}-${t}`,
            tenantId: TENANT_ID,
            tripId,
            oldPurpose: 'private',
            newPurpose: purpose,
            changedById: adminUser.id,
            changedAt: at(date, 18, 30),
            reason: 'Nachträgliche Korrektur laut Tourenplan.',
          },
        });
        purposeLogs += 1;
      }
    }

    // fuel entry every ~2 days
    if (day % 2 === 0) {
      const idx = day % drivers.length;
      const liters = 38 + random() * 42;
      const pricePerL = 1.62 + random() * 0.28;
      await prisma.fleetFuelEntry.upsert({
        where: { id: `demo-fill-fuel-${day}` },
        update: {},
        create: {
          id: `demo-fill-fuel-${day}`,
          tenantId: TENANT_ID,
          vehicleId: v(idx).id,
          driverId: d(idx).id,
          enteredAt: at(date, 17, 15),
          liters: dec(liters),
          totalCost: new Prisma.Decimal((liters * pricePerL).toFixed(2)),
          odometerKm: dec(80000 + idx * 15000 + (30 - day) * 180 + 120),
          isFullTank: random() > 0.3,
        },
      });
      fuel += 1;
    }
  }

  console.log('[seed-demo-fill] done:', { licenses, checks, defects, fines, equipment, rules, trips, events, fuel, purposeLogs });
}

main()
  .catch((error) => {
    console.error('[seed-demo-fill] failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
