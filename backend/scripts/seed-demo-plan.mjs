#!/usr/bin/env node
/**
 * Demo plan seed — realistic Einsatzplan for default-tenant:
 * - Assignments for ~90% of active drivers across a 9-day window
 *   (past 5 workdays completed, today in_progress/confirmed, next days planned)
 * - A few drivers intentionally UNPLANNED each day, a few on leave (vacation/sick)
 * - Morning check-ins, departure checks (+item results), work sessions,
 *   vehicle handovers, transport requests and calendar events tied together.
 *
 * Idempotent: fixed ids (demo-plan-*) + upsert; safe to re-run.
 *
 * Usage: node scripts/seed-demo-plan.mjs
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = 'default-tenant';

// Drivers left without a plan on purpose (indices into the driver list)
const UNPLANNED_INDICES = new Set([7, 19, 33]);
// Drivers on approved leave (index → type)
const LEAVE_PLAN = new Map([
  [4, { type: 'vacation', calStatus: 'UT', reason: 'Jahresurlaub' }],
  [11, { type: 'sick_leave', calStatus: 'KT', reason: 'Krankmeldung mit Attest' }],
  [26, { type: 'vacation', calStatus: 'UT', reason: 'Resturlaub 2025' }],
]);

const ROUTES = [
  { name: 'Tour Nord — Hamburg', pickup: 'Lager Berlin-Spandau, Brunsbütteler Damm 120', delivery: 'DHL Hub Hamburg-Billbrook, Halskestraße 48' },
  { name: 'Tour West — Hannover', pickup: 'Lager Berlin-Spandau, Brunsbütteler Damm 120', delivery: 'Amazon FC HAM2, Hannover-Anderten' },
  { name: 'Tour Süd — Leipzig', pickup: 'Depot Berlin-Neukölln, Grenzallee 15', delivery: 'UPS Center Leipzig, Poststraße 1' },
  { name: 'Stadtverteiler Berlin Ost', pickup: 'Depot Berlin-Neukölln, Grenzallee 15', delivery: 'Zustellgebiet Berlin Lichtenberg/Marzahn' },
  { name: 'Stadtverteiler Berlin West', pickup: 'Lager Berlin-Spandau, Brunsbütteler Damm 120', delivery: 'Zustellgebiet Charlottenburg/Wilmersdorf' },
  { name: 'Tour Brandenburg', pickup: 'Depot Berlin-Neukölln, Grenzallee 15', delivery: 'Hermes Depot Potsdam, Wetzlarer Straße 54' },
  { name: 'Nachtlinie — Dresden', pickup: 'Lager Berlin-Spandau, Brunsbütteler Damm 120', delivery: 'DB Schenker Terminal Dresden, Hamburger Straße 19' },
];
const CARGOS = [
  { name: 'Paletten Trockenware', owner: 'REWE Logistik' },
  { name: 'Paketsendungen Standard', owner: 'DHL Paket' },
  { name: 'Wechselbrücke Textil', owner: 'Zalando SE' },
  { name: 'Lebensmittel gekühlt', owner: 'Penny Markt' },
  { name: 'Elektronik Kleinteile', owner: 'Amazon EU' },
  { name: 'Baumaterial Sackware', owner: 'Hornbach' },
  { name: 'Retourenpaletten', owner: 'UPS SCS' },
];
const SHIFTS = [
  { start: '05:30', end: '14:00', checkinH: 5 },
  { start: '06:00', end: '14:30', checkinH: 5 },
  { start: '07:00', end: '15:30', checkinH: 6 },
  { start: '08:00', end: '16:30', checkinH: 7 },
  { start: '13:30', end: '22:00', checkinH: 12 },
];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function dayAt(offset, hours = 0, minutes = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// UTC midnight of the calendar day — required for @db.Date and day-marker fields.
function dateAt(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

async function main() {
  const [drivers, vehicles, companies, adminUser, templates] = await Promise.all([
    prisma.driver.findMany({
      where: { tenantId: TENANT_ID, status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.vehicle.findMany({
      where: { tenantId: TENANT_ID, deletedAt: null, status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, plateNumber: true },
    }),
    prisma.company.findMany({
      where: { tenantId: TENANT_ID },
      orderBy: { createdAt: 'asc' },
      take: 8,
      select: { id: true, name: true },
    }),
    prisma.user.findFirst({ where: { tenantId: TENANT_ID, role: 'admin' }, select: { id: true } }),
    prisma.checklistTemplate.findMany({
      where: { tenantId: TENANT_ID },
      select: { id: true, name: true, items: { select: { id: true, itemKey: true, label: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } } },
    }),
  ]);

  if (!adminUser) throw new Error('No admin user in default-tenant.');
  if (drivers.length < 10 || vehicles.length < 10 || companies.length < 3) {
    throw new Error('Not enough base data — run prisma db seed first.');
  }
  const template = templates.find((t) => t.items.length > 0);
  if (!template) throw new Error('No checklist template with items found.');

  const random = rng(20260716);
  const pairCount = Math.min(drivers.length, vehicles.length);
  const counters = { assignments: 0, calendar: 0, leaves: 0, checkins: 0, depChecks: 0, workSessions: 0, handovers: 0, transportRequests: 0 };

  // ── 0. Remove previous demo-plan rows so date fixes apply cleanly ─────
  await prisma.departureCheck.deleteMany({ where: { id: { startsWith: 'demo-plan-dc-' } } });
  await prisma.morningCheckin.deleteMany({ where: { id: { startsWith: 'demo-plan-ci-' } } });
  await prisma.workSession.deleteMany({ where: { id: { startsWith: 'demo-plan-ws-' } } });
  await prisma.vehicleHandover.deleteMany({ where: { id: { startsWith: 'demo-plan-ho-' } } });
  await prisma.transportRequest.deleteMany({ where: { id: { startsWith: 'demo-plan-tr-' } } });
  await prisma.calendarEvent.deleteMany({ where: { id: { startsWith: 'demo-plan-cal-' } } });
  await prisma.assignment.deleteMany({ where: { id: { startsWith: 'demo-plan-asg-' } } });
  await prisma.request.deleteMany({ where: { id: { startsWith: 'demo-plan-leave-' } } });

  // ── 1. Leave requests + calendar (whole window) ───────────────────────
  for (const [idx, leave] of LEAVE_PLAN) {
    const driver = drivers[idx];
    if (!driver) continue;
    const reqId = `demo-plan-leave-${idx}`;
    await prisma.request.upsert({
      where: { id: reqId },
      update: {},
      create: {
        id: reqId,
        tenantId: TENANT_ID,
        driverId: driver.id,
        type: leave.type,
        startDate: dateAt(-2),
        endDate: dateAt(4),
        reason: leave.reason,
        status: 'approved',
        approvedById: adminUser.id,
      },
    });
    counters.leaves += 1;
    for (let offset = -2; offset <= 4; offset += 1) {
      await prisma.calendarEvent.upsert({
        where: { id: `demo-plan-cal-leave-${idx}-${offset}` },
        update: {},
        create: {
          id: `demo-plan-cal-leave-${idx}-${offset}`,
          tenantId: TENANT_ID,
          driverId: driver.id,
          requestId: reqId,
          date: dateAt(offset),
          status: leave.calStatus,
          source: 'leave',
        },
      });
      counters.calendar += 1;
    }
  }

  // ── 2. Day-by-day plan ────────────────────────────────────────────────
  for (let offset = -5; offset <= 3; offset += 1) {
    const workDate = dateAt(offset);
    const localDay = dayAt(offset).getDay();
    if (localDay === 0) continue; // Sunday
    const isPast = offset < 0;
    const isToday = offset === 0;

    for (let i = 0; i < pairCount; i += 1) {
      if (UNPLANNED_INDICES.has(i)) continue; // intentionally unplanned
      if (LEAVE_PLAN.has(i)) continue; // on leave
      // Saturdays: skeleton crew only
      if (localDay === 6 && i % 4 !== 0) continue;
      // sprinkle a few extra gaps so it looks organic
      if (!isToday && random() < 0.06) continue;

      const driver = drivers[i];
      const vehicle = vehicles[i];
      const company = companies[i % companies.length];
      const route = ROUTES[(i + offset + 10) % ROUTES.length];
      const cargo = CARGOS[(i * 3 + offset + 10) % CARGOS.length];
      const shift = SHIFTS[i % SHIFTS.length];
      const suffix = `${offset + 10}-${i}`;
      const assignmentId = `demo-plan-asg-${suffix}`;

      let status;
      if (isPast) status = random() < 0.05 ? 'cancelled' : 'completed';
      else if (isToday) status = i % 5 === 4 ? 'confirmed' : 'in_progress';
      else status = i % 3 === 0 ? 'confirmed' : 'planned';

      await prisma.assignment.upsert({
        where: { id: assignmentId },
        update: { status },
        create: {
          id: assignmentId,
          tenantId: TENANT_ID,
          driverId: driver.id,
          vehicleId: vehicle.id,
          companyId: company.id,
          cargoName: cargo.name,
          cargoOwner: cargo.owner,
          pickupAddress: route.pickup,
          deliveryAddress: route.delivery,
          workDate,
          startTime: shift.start,
          endTime: shift.end,
          routeName: route.name,
          expectedDailyRevenue: Math.round(420 + random() * 480),
          status,
          notes: status === 'cancelled' ? 'Kunde hat Tour kurzfristig storniert.' : null,
          createdById: adminUser.id,
        },
      });
      counters.assignments += 1;

      await prisma.calendarEvent.upsert({
        where: { id: `demo-plan-cal-${suffix}` },
        update: {},
        create: {
          id: `demo-plan-cal-${suffix}`,
          tenantId: TENANT_ID,
          driverId: driver.id,
          assignmentId,
          date: workDate,
          status: 'AT',
          source: 'assignment',
        },
      });
      counters.calendar += 1;

      // ── Morning check-in (past + today, ~85%) ─────────────────────────
      if ((isPast || isToday) && status !== 'cancelled' && random() < 0.88) {
        const checkinStatuses = isToday
          ? ['added_to_einsatzplan', 'added_to_einsatzplan', 'confirmed', 'waiting_for_review']
          : ['added_to_einsatzplan', 'confirmed'];
        const ciStatus = i === 13 && isToday ? 'conflict' : checkinStatuses[i % checkinStatuses.length];
        await prisma.morningCheckin.upsert({
          where: { id: `demo-plan-ci-${suffix}` },
          update: {},
          create: {
            id: `demo-plan-ci-${suffix}`,
            tenantId: TENANT_ID,
            driverId: driver.id,
            date: workDate,
            submittedAt: dayAt(offset, shift.checkinH, 10 + Math.floor(random() * 30)),
            vehiclePlate: vehicle.plateNumber,
            companyName: company.name,
            cargoName: cargo.name,
            cargoQuantity: `${8 + Math.floor(random() * 22)} Paletten`,
            status: ciStatus,
            conflictReason: ciStatus === 'conflict' ? 'Gemeldetes Kennzeichen weicht vom Einsatzplan ab.' : null,
            assignmentId: ciStatus === 'conflict' ? null : assignmentId,
          },
        });
        counters.checkins += 1;
      }

      // ── Departure check (past + today, most drivers) ──────────────────
      if ((isPast || isToday) && status !== 'cancelled' && random() < 0.82) {
        const existing = await prisma.departureCheck.findFirst({
          where: { driverId: driver.id, vehicleId: vehicle.id, workDate },
          select: { id: true },
        });
        if (!existing) {
          const hasDefect = random() < 0.08;
          const check = await prisma.departureCheck.create({
            data: {
              id: `demo-plan-dc-${suffix}`,
              tenantId: TENANT_ID,
              driverId: driver.id,
              vehicleId: vehicle.id,
              assignmentId,
              templateId: template.id,
              workDate,
              performedAt: dayAt(offset, shift.checkinH, 20 + Math.floor(random() * 25)),
              latitude: 52.4839 + (random() - 0.5) * 0.05,
              longitude: 13.3626 + (random() - 0.5) * 0.08,
              accuracyM: 8 + random() * 12,
              overallStatus: hasDefect ? 'maengel_gemeldet' : 'ok',
              templateNameSnapshot: template.name,
              signatureConfirmedAt: dayAt(offset, shift.checkinH, 45),
              itemResults: {
                create: template.items.map((item, itemIdx) => ({
                  id: `demo-plan-dcr-${suffix}-${itemIdx}`,
                  templateItemId: item.id,
                  itemKey: item.itemKey,
                  itemLabel: item.label,
                  sortOrder: item.sortOrder,
                  result: hasDefect && itemIdx === 2 ? 'defekt' : 'ok',
                  defectDescription: hasDefect && itemIdx === 2 ? 'Beleuchtung hinten links ohne Funktion.' : null,
                  photoStoredPaths: [],
                })),
              },
            },
          });
          if (check) counters.depChecks += 1;
        }
      }

      // ── Work sessions (past ended, today active) ──────────────────────
      if ((isPast || isToday) && status !== 'cancelled' && random() < 0.9) {
        const [sh, sm] = shift.start.split(':').map(Number);
        const [eh, em] = shift.end.split(':').map(Number);
        await prisma.workSession.upsert({
          where: { id: `demo-plan-ws-${suffix}` },
          update: {},
          create: {
            id: `demo-plan-ws-${suffix}`,
            tenantId: TENANT_ID,
            driverId: driver.id,
            startedAt: dayAt(offset, sh, sm + Math.floor(random() * 10)),
            endedAt: isToday ? null : dayAt(offset, eh, em + Math.floor(random() * 20)),
            lastSeenAt: isToday ? new Date() : dayAt(offset, eh, em),
            source: 'manual',
            endReason: isToday ? null : 'manual',
            status: isToday ? 'active' : 'ended',
          },
        });
        counters.workSessions += 1;
      }
    }
  }

  // ── 3. Vehicle handovers (recent days) ────────────────────────────────
  const handoverPlans = [
    { offset: 0, i: 2, type: 'pickup', photo: 'uploaded', damage: false, status: 'completed' },
    { offset: 0, i: 6, type: 'pickup', photo: 'missing', damage: false, status: 'pending' },
    { offset: -1, i: 9, type: 'return', photo: 'uploaded', damage: true, status: 'completed', damageNotes: 'Kratzer an der Schiebetür rechts, ca. 8 cm.' },
    { offset: -1, i: 14, type: 'pickup', photo: 'approved', damage: false, status: 'completed' },
    { offset: -2, i: 21, type: 'return', photo: 'uploaded', damage: false, status: 'completed' },
    { offset: 1, i: 5, type: 'pickup', photo: 'not_required', damage: false, status: 'pending' },
  ];
  for (let h = 0; h < handoverPlans.length; h += 1) {
    const plan = handoverPlans[h];
    const driver = drivers[plan.i];
    const vehicle = vehicles[plan.i];
    if (!driver || !vehicle) continue;
    await prisma.vehicleHandover.upsert({
      where: { id: `demo-plan-ho-${h}` },
      update: {},
      create: {
        id: `demo-plan-ho-${h}`,
        tenantId: TENANT_ID,
        driverId: driver.id,
        vehicleId: vehicle.id,
        handoverType: plan.type,
        handoverDateTime: dayAt(plan.offset, 6, 30),
        photoRequired: plan.photo !== 'not_required',
        photoStatus: plan.photo,
        damageDetected: plan.damage,
        damageNotes: plan.damageNotes ?? null,
        equipmentFirstAidKit: true,
        equipmentFireExtinguisher: true,
        equipmentStraps: plan.i % 2 === 0,
        equipmentSafetyVest: true,
        equipmentVerifiedAt: dayAt(plan.offset, 6, 40),
        status: plan.status,
      },
    });
    counters.handovers += 1;
  }

  // ── 4. Transport requests (upcoming, mixed statuses) ──────────────────
  const trPlans = [
    { offset: 1, i: 3, status: 'pending' },
    { offset: 1, i: 8, status: 'pending' },
    { offset: 2, i: 12, status: 'approved' },
    { offset: 2, i: 16, status: 'needs_review', conflict: 'Fahrzeug bereits für Tour Nord verplant.' },
    { offset: 3, i: 20, status: 'pending' },
    { offset: 3, i: 24, status: 'rejected', conflict: 'Fahrer hat genehmigten Urlaub.' },
  ];
  for (let t = 0; t < trPlans.length; t += 1) {
    const plan = trPlans[t];
    const driver = drivers[plan.i];
    const vehicle = vehicles[plan.i];
    if (!driver || !vehicle) continue;
    const route = ROUTES[t % ROUTES.length];
    const cargo = CARGOS[t % CARGOS.length];
    await prisma.transportRequest.upsert({
      where: { id: `demo-plan-tr-${t}` },
      update: {},
      create: {
        id: `demo-plan-tr-${t}`,
        tenantId: TENANT_ID,
        driverId: driver.id,
        vehicleId: vehicle.id,
        companyId: companies[t % companies.length].id,
        cargoName: cargo.name,
        cargoOwner: cargo.owner,
        pickupAddress: route.pickup,
        deliveryAddress: route.delivery,
        requestedDate: dateAt(plan.offset),
        startTime: '07:00',
        endTime: '15:30',
        status: plan.status,
        conflictReason: plan.conflict ?? null,
      },
    });
    counters.transportRequests += 1;
  }

  console.log('[seed-demo-plan] done:', counters);
  console.log('[seed-demo-plan] unplanned today:', [...UNPLANNED_INDICES].map((i) => drivers[i] ? `${drivers[i].firstName} ${drivers[i].lastName}` : null).filter(Boolean));
  console.log('[seed-demo-plan] on leave:', [...LEAVE_PLAN.keys()].map((i) => drivers[i] ? `${drivers[i].firstName} ${drivers[i].lastName}` : null).filter(Boolean));
}

main()
  .catch((error) => {
    console.error('[seed-demo-plan] failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
