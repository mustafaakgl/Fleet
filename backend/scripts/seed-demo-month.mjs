#!/usr/bin/env node
/**
 * Demo month seed — a full month of operating data for one tenant, so every
 * screen looks like a real company that has been using the system for 30 days.
 *
 * Covers: driver licenses + license checks for EVERY active driver, daily
 * assignments/calendar, morning check-ins, departure checks (+ item results and
 * defects), work sessions, leave requests, vehicle handovers, transport
 * requests, service records, fines, accidents, fuel entries, reminders and
 * driver/vehicle documents.
 *
 * Supersedes scripts/seed-demo-plan.mjs (same window, wider range): its
 * demo-plan-* rows are removed first so no day gets a duplicate plan.
 *
 * Idempotent: every row uses a fixed `demo-month-*` id and the previous run is
 * purged up front; safe to re-run.
 *
 * Usage: node scripts/seed-demo-month.mjs
 *   SEED_TENANT_ID=<id>      target tenant   (default: default-tenant)
 *   SEED_DAYS_BACK=<n>       history length  (default: 30)
 *   SEED_DAYS_FORWARD=<n>    planned days    (default: 3)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = process.env.SEED_TENANT_ID ?? 'default-tenant';
const DAYS_BACK = Number(process.env.SEED_DAYS_BACK ?? 30);
const DAYS_FORWARD = Number(process.env.SEED_DAYS_FORWARD ?? 3);
const P = 'demo-month-';

// Drivers left without a plan on purpose (indices into the driver list).
const UNPLANNED_INDICES = new Set([7, 19, 33]);
// Approved absences spread across the month: index → window + calendar code.
const LEAVE_PLAN = [
  { i: 4, type: 'vacation', calStatus: 'UT', from: -27, to: -20, reason: 'Jahresurlaub' },
  { i: 11, type: 'sick_leave', calStatus: 'KT', from: -18, to: -14, reason: 'Krankmeldung mit Attest' },
  { i: 26, type: 'vacation', calStatus: 'UT', from: -12, to: -6, reason: 'Resturlaub 2025' },
  { i: 31, type: 'training', calStatus: 'SCH', from: -9, to: -8, reason: 'ADR-Auffrischung' },
  { i: 2, type: 'vacation', calStatus: 'UT', from: -4, to: 2, reason: 'Sommerurlaub' },
  { i: 17, type: 'sick_leave', calStatus: 'KT', from: -2, to: 1, reason: 'Grippaler Infekt' },
  { i: 40, type: 'doctor_appointment', calStatus: 'AB', from: -1, to: -1, reason: 'Betriebsarzt G25' },
];

const ROUTES = [
  { name: 'Tour Nord — Hamburg', pickup: 'Lager Berlin-Spandau, Brunsbütteler Damm 120', delivery: 'DHL Hub Hamburg-Billbrook, Halskestraße 48' },
  { name: 'Tour West — Hannover', pickup: 'Lager Berlin-Spandau, Brunsbütteler Damm 120', delivery: 'Amazon FC HAM2, Hannover-Anderten' },
  { name: 'Tour Süd — Leipzig', pickup: 'Depot Berlin-Neukölln, Grenzallee 15', delivery: 'UPS Center Leipzig, Poststraße 1' },
  { name: 'Stadtverteiler Berlin Ost', pickup: 'Depot Berlin-Neukölln, Grenzallee 15', delivery: 'Zustellgebiet Berlin Lichtenberg/Marzahn' },
  { name: 'Stadtverteiler Berlin West', pickup: 'Lager Berlin-Spandau, Brunsbütteler Damm 120', delivery: 'Zustellgebiet Charlottenburg/Wilmersdorf' },
  { name: 'Tour Brandenburg', pickup: 'Depot Berlin-Neukölln, Grenzallee 15', delivery: 'Hermes Depot Potsdam, Wetzlarer Straße 54' },
  { name: 'Nachtlinie — Dresden', pickup: 'Lager Berlin-Spandau, Brunsbütteler Damm 120', delivery: 'DB Schenker Terminal Dresden, Hamburger Straße 19' },
  { name: 'Tour Ost — Frankfurt (Oder)', pickup: 'Depot Berlin-Neukölln, Grenzallee 15', delivery: 'Logistikzentrum Frankfurt (Oder), Spitzkrugring 2' },
];
const CARGOS = [
  { name: 'Paletten Trockenware', owner: 'REWE Logistik' },
  { name: 'Paketsendungen Standard', owner: 'DHL Paket' },
  { name: 'Wechselbrücke Textil', owner: 'Zalando SE' },
  { name: 'Lebensmittel gekühlt', owner: 'Penny Markt' },
  { name: 'Elektronik Kleinteile', owner: 'Amazon EU' },
  { name: 'Baumaterial Sackware', owner: 'Hornbach' },
  { name: 'Retourenpaletten', owner: 'UPS SCS' },
  { name: 'Getränkepaletten', owner: 'Radeberger Gruppe' },
];
const SHIFTS = [
  { start: '05:30', end: '14:00', checkinH: 5 },
  { start: '06:00', end: '14:30', checkinH: 5 },
  { start: '07:00', end: '15:30', checkinH: 6 },
  { start: '08:00', end: '16:30', checkinH: 7 },
  { start: '13:30', end: '22:00', checkinH: 12 },
];

const LICENSE_CLASS_SETS = [['B'], ['B', 'BE'], ['B', 'C1', 'C1E'], ['B', 'C', 'CE'], ['B', 'C', 'CE', 'T']];
const LICENSE_AUTHORITIES = [
  'Bürgeramt Berlin-Mitte',
  'Landesamt für Bürger- und Ordnungsangelegenheiten Berlin',
  'Straßenverkehrsamt Potsdam',
  'Landratsamt München',
  'Straßenverkehrsamt Köln',
];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Local wall-clock instant on the day `offset` days from today. */
function dayAt(offset, hours = 0, minutes = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/** UTC midnight of the calendar day — required for @db.Date and day-marker fields. */
function dateAt(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

async function insertAll(delegate, rows, label, counters) {
  for (let i = 0; i < rows.length; i += 500) {
    const { count } = await delegate.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });
    counters[label] = (counters[label] ?? 0) + count;
  }
}

async function purgePreviousRun() {
  const idPrefixes = [P, 'demo-plan-'];
  const startsWith = (suffix) => idPrefixes.map((prefix) => ({ id: { startsWith: `${prefix}${suffix}` } }));

  // Assignments are referenced by invoicing claims with a restricting FK.
  await prisma.invoiceAssignmentClaim.deleteMany({ where: { OR: startsWith('asg-') } });
  await prisma.defect.deleteMany({ where: { OR: startsWith('defect-') } });
  await prisma.departureCheck.deleteMany({ where: { OR: startsWith('dc-') } });
  await prisma.morningCheckin.deleteMany({ where: { OR: startsWith('ci-') } });
  await prisma.workSession.deleteMany({ where: { OR: startsWith('ws-') } });
  await prisma.vehicleHandover.deleteMany({ where: { OR: startsWith('ho-') } });
  await prisma.transportRequest.deleteMany({ where: { OR: startsWith('tr-') } });
  await prisma.calendarEvent.deleteMany({ where: { OR: startsWith('cal-') } });
  await prisma.accident.deleteMany({ where: { OR: startsWith('acc-') } });
  await prisma.fine.deleteMany({ where: { OR: startsWith('fine-') } });
  await prisma.assignment.deleteMany({ where: { OR: startsWith('asg-') } });
  await prisma.request.deleteMany({ where: { OR: startsWith('leave-') } });
  await prisma.serviceRecord.deleteMany({ where: { OR: startsWith('svc-') } });
  await prisma.fleetFuelEntry.deleteMany({ where: { OR: startsWith('fuel-') } });
  await prisma.document.deleteMany({ where: { OR: startsWith('doc-') } });
  await prisma.reminder.deleteMany({ where: { OR: startsWith('rem-') } });
  await prisma.licenseCheck.deleteMany({ where: { OR: startsWith('lcheck-') } });
  await prisma.driverLicense.deleteMany({ where: { OR: startsWith('lic-') } });
}

async function main() {
  const [drivers, vehicles, companies, adminUser, templates] = await Promise.all([
    prisma.driver.findMany({
      where: { tenantId: TENANT_ID, status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, licenseNumber: true },
    }),
    prisma.vehicle.findMany({
      where: { tenantId: TENANT_ID, deletedAt: null, status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, plateNumber: true, brand: true, model: true },
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
      select: {
        id: true,
        name: true,
        items: { select: { id: true, itemKey: true, label: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
      },
    }),
  ]);

  if (!adminUser) throw new Error(`No admin user in ${TENANT_ID}.`);
  if (drivers.length < 10 || vehicles.length < 10 || companies.length < 3) {
    throw new Error(`Not enough base data in ${TENANT_ID} — run prisma db seed first.`);
  }
  const template = templates.find((tpl) => tpl.items.length > 0);
  if (!template) throw new Error('No checklist template with items found.');

  const random = rng(20260730);
  const pairCount = Math.min(drivers.length, vehicles.length);
  const counters = {};

  await purgePreviousRun();

  // ── 1. Driver licenses + license checks for every active driver ───────
  const licensedDriverIds = new Set(
    (
      await prisma.driverLicense.findMany({
        where: { tenantId: TENANT_ID, deletedAt: null },
        select: { driverId: true },
      })
    ).map((row) => row.driverId),
  );

  const licenses = [];
  const licenseChecks = [];
  for (let i = 0; i < drivers.length; i += 1) {
    const driver = drivers[i];
    // Expiry mix so the "expiring soon" / "expired" filters have content.
    const expiresInDays = i % 16 === 0 ? -12 - i : i % 8 === 0 ? 20 + i : 400 + i * 21;
    const licenseId = `${P}lic-${i}`;

    if (!licensedDriverIds.has(driver.id)) {
      licenses.push({
        id: licenseId,
        tenantId: TENANT_ID,
        driverId: driver.id,
        licenseNumber: driver.licenseNumber ?? `B${String(72031400 + i * 137)}`,
        classes: LICENSE_CLASS_SETS[i % LICENSE_CLASS_SETS.length],
        issuedAt: dateAt(-(365 * 5 + i * 37)),
        expiresAt: dateAt(expiresInDays),
        issuingAuthority: LICENSE_AUTHORITIES[i % LICENSE_AUTHORITIES.length],
        nextCheckDueAt: dateAt(i % 7 === 0 ? -3 + i : 45 + i * 4),
        lastApprovedCheckAt: dayAt(-(170 + (i % 30) * 3), 10),
      });
    }

    // Two historic checks + one recent, statuses vary for the review queue.
    const checkPlans = [
      { type: 'initial', status: 'approved', daysAgo: 360 + (i % 20) },
      { type: 'periodic', status: 'approved', daysAgo: 175 + (i % 15) },
      i % 11 === 0
        ? { type: 'periodic', status: 'rejected', daysAgo: 5 + (i % 9), rejectionReason: 'Foto unscharf — Vorderseite erneut hochladen.' }
        : i % 5 === 0
          ? { type: 'periodic', status: 'pending', daysAgo: i % 4 }
          : { type: 'periodic', status: 'approved', daysAgo: 10 + (i % 20) },
    ];
    for (let c = 0; c < checkPlans.length; c += 1) {
      const plan = checkPlans[c];
      licenseChecks.push({
        id: `${P}lcheck-${i}-${c}`,
        tenantId: TENANT_ID,
        driverId: driver.id,
        driverLicenseId: licensedDriverIds.has(driver.id) ? null : licenseId,
        checkDate: dateAt(-plan.daysAgo),
        checkType: plan.type,
        status: plan.status,
        verifiedById: plan.status === 'pending' ? null : adminUser.id,
        verifiedAt: plan.status === 'pending' ? null : dayAt(-plan.daysAgo, 9, 30),
        rejectionReason: plan.rejectionReason ?? null,
        dueAt: dateAt(-plan.daysAgo - 7),
        notes: plan.type === 'initial' ? 'Erstkontrolle bei Einstellung.' : null,
      });
    }
  }
  await insertAll(prisma.driverLicense, licenses, 'driverLicenses', counters);
  await insertAll(prisma.licenseCheck, licenseChecks, 'licenseChecks', counters);

  // Keep the denormalised driver fields in sync with the license rows.
  for (const license of licenses) {
    await prisma.driver.update({
      where: { id: license.driverId },
      data: { licenseNumber: license.licenseNumber, licenseExpiryDate: license.expiresAt },
    });
  }

  // ── 2. Absences (requests + calendar) ─────────────────────────────────
  const leaveRequests = [];
  const calendarEvents = [];
  const leaveDaysByDriver = new Map();
  for (const leave of LEAVE_PLAN) {
    const driver = drivers[leave.i];
    if (!driver) continue;
    const requestId = `${P}leave-${leave.i}`;
    leaveRequests.push({
      id: requestId,
      tenantId: TENANT_ID,
      driverId: driver.id,
      type: leave.type,
      startDate: dateAt(leave.from),
      endDate: dateAt(leave.to),
      reason: leave.reason,
      status: 'approved',
      approvedById: adminUser.id,
    });
    const blocked = leaveDaysByDriver.get(leave.i) ?? new Set();
    for (let offset = leave.from; offset <= leave.to; offset += 1) {
      blocked.add(offset);
      calendarEvents.push({
        id: `${P}cal-leave-${leave.i}-${offset + DAYS_BACK}`,
        tenantId: TENANT_ID,
        driverId: driver.id,
        requestId,
        date: dateAt(offset),
        status: leave.calStatus,
        source: 'leave',
      });
    }
    leaveDaysByDriver.set(leave.i, blocked);
  }
  await insertAll(prisma.request, leaveRequests, 'leaveRequests', counters);

  // ── 3. Day-by-day operations across the whole window ──────────────────
  const existingChecks = new Set(
    (
      await prisma.departureCheck.findMany({
        where: { tenantId: TENANT_ID, workDate: { gte: dateAt(-DAYS_BACK), lte: dateAt(DAYS_FORWARD) } },
        select: { driverId: true, vehicleId: true, workDate: true },
      })
    ).map((row) => `${row.driverId}|${row.vehicleId}|${row.workDate.toISOString().slice(0, 10)}`),
  );

  const assignments = [];
  const morningCheckins = [];
  const departureChecks = [];
  const checkItemResults = [];
  const workSessions = [];
  const defects = [];

  for (let offset = -DAYS_BACK; offset <= DAYS_FORWARD; offset += 1) {
    const workDate = dateAt(offset);
    const weekday = dayAt(offset).getDay();
    if (weekday === 0) continue; // Sunday closed
    const isPast = offset < 0;
    const isToday = offset === 0;
    const dayKey = offset + DAYS_BACK;

    for (let i = 0; i < pairCount; i += 1) {
      if (UNPLANNED_INDICES.has(i)) continue;
      if (leaveDaysByDriver.get(i)?.has(offset)) continue;
      if (weekday === 6 && i % 4 !== 0) continue; // Saturday: skeleton crew
      if (!isToday && random() < 0.06) continue; // organic gaps

      const driver = drivers[i];
      const vehicle = vehicles[i];
      const company = companies[(i + dayKey) % companies.length];
      const route = ROUTES[(i + dayKey) % ROUTES.length];
      const cargo = CARGOS[(i * 3 + dayKey) % CARGOS.length];
      const shift = SHIFTS[i % SHIFTS.length];
      const suffix = `${dayKey}-${i}`;
      const assignmentId = `${P}asg-${suffix}`;

      let status;
      if (isPast) status = random() < 0.05 ? 'cancelled' : 'completed';
      else if (isToday) status = i % 5 === 4 ? 'confirmed' : 'in_progress';
      else status = i % 3 === 0 ? 'confirmed' : 'planned';

      assignments.push({
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
      });

      calendarEvents.push({
        id: `${P}cal-${suffix}`,
        tenantId: TENANT_ID,
        driverId: driver.id,
        assignmentId,
        date: workDate,
        status: 'AT',
        source: 'assignment',
      });

      if (status === 'cancelled') continue;

      if ((isPast || isToday) && random() < 0.88) {
        const pool = isToday
          ? ['added_to_einsatzplan', 'added_to_einsatzplan', 'confirmed', 'waiting_for_review']
          : ['added_to_einsatzplan', 'confirmed'];
        const ciStatus = i === 13 && isToday ? 'conflict' : pool[i % pool.length];
        morningCheckins.push({
          id: `${P}ci-${suffix}`,
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
        });
      }

      const checkKey = `${driver.id}|${vehicle.id}|${workDate.toISOString().slice(0, 10)}`;
      if ((isPast || isToday) && random() < 0.82 && !existingChecks.has(checkKey)) {
        existingChecks.add(checkKey);
        const hasDefect = random() < 0.07;
        const checkId = `${P}dc-${suffix}`;
        departureChecks.push({
          id: checkId,
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
        });
        for (let itemIdx = 0; itemIdx < template.items.length; itemIdx += 1) {
          const item = template.items[itemIdx];
          const broken = hasDefect && itemIdx === 2;
          checkItemResults.push({
            id: `${P}dcr-${suffix}-${itemIdx}`,
            departureCheckId: checkId,
            templateItemId: item.id,
            itemKey: item.itemKey,
            itemLabel: item.label,
            sortOrder: item.sortOrder,
            result: broken ? 'defekt' : 'ok',
            defectDescription: broken ? 'Beleuchtung hinten links ohne Funktion.' : null,
            photoStoredPaths: [],
          });
        }
        if (hasDefect) {
          const repaired = offset < -5;
          defects.push({
            id: `${P}defect-${suffix}`,
            tenantId: TENANT_ID,
            vehicleId: vehicle.id,
            reportedByDriverId: driver.id,
            source: 'departure_check',
            title: 'Beleuchtung hinten links ohne Funktion',
            description: `Bei der Abfahrtskontrolle am ${workDate.toISOString().slice(0, 10)} festgestellt: Rücklicht links ohne Funktion.`,
            severity: 'mittel',
            status: repaired ? 'behoben' : 'offen',
            photoStoredPaths: [],
            repairCompany: repaired ? 'Hauswerkstatt Spandau' : null,
            createdAt: dayAt(offset, shift.checkinH, 50),
          });
        }
      }

      if ((isPast || isToday) && random() < 0.9) {
        const [sh, sm] = shift.start.split(':').map(Number);
        const [eh, em] = shift.end.split(':').map(Number);
        workSessions.push({
          id: `${P}ws-${suffix}`,
          tenantId: TENANT_ID,
          driverId: driver.id,
          startedAt: dayAt(offset, sh, sm + Math.floor(random() * 10)),
          endedAt: isToday ? null : dayAt(offset, eh, em + Math.floor(random() * 20)),
          lastSeenAt: isToday ? new Date() : dayAt(offset, eh, em),
          source: 'manual',
          endReason: isToday ? null : 'manual',
          status: isToday ? 'active' : 'ended',
        });
      }
    }
  }

  await insertAll(prisma.assignment, assignments, 'assignments', counters);
  await insertAll(prisma.calendarEvent, calendarEvents, 'calendarEvents', counters);
  await insertAll(prisma.morningCheckin, morningCheckins, 'morningCheckins', counters);
  await insertAll(prisma.departureCheck, departureChecks, 'departureChecks', counters);
  await insertAll(prisma.departureCheckItemResult, checkItemResults, 'checkItemResults', counters);
  await insertAll(prisma.defect, defects, 'defects', counters);
  await insertAll(prisma.workSession, workSessions, 'workSessions', counters);

  // ── 4. Vehicle handovers spread over the month ────────────────────────
  const handovers = [];
  const handoverPhotoStates = ['uploaded', 'approved', 'missing', 'not_required'];
  for (let h = 0; h < 18; h += 1) {
    const offset = -DAYS_BACK + 2 + h * 2;
    if (offset > DAYS_FORWARD) break;
    const i = (h * 5 + 2) % pairCount;
    const photoStatus = handoverPhotoStates[h % handoverPhotoStates.length];
    const damage = h % 6 === 3;
    handovers.push({
      id: `${P}ho-${h}`,
      tenantId: TENANT_ID,
      driverId: drivers[i].id,
      vehicleId: vehicles[i].id,
      handoverType: h % 2 === 0 ? 'pickup' : 'return',
      handoverDateTime: dayAt(offset, 6, 30),
      photoRequired: photoStatus !== 'not_required',
      photoStatus,
      damageDetected: damage,
      damageNotes: damage ? 'Kratzer an der Schiebetür rechts, ca. 8 cm.' : null,
      equipmentFirstAidKit: true,
      equipmentFireExtinguisher: true,
      equipmentStraps: i % 2 === 0,
      equipmentSafetyVest: true,
      equipmentVerifiedAt: dayAt(offset, 6, 40),
      status: photoStatus === 'missing' ? 'pending' : 'completed',
    });
  }
  await insertAll(prisma.vehicleHandover, handovers, 'vehicleHandovers', counters);

  // ── 5. Transport requests (recent + upcoming) ─────────────────────────
  const transportRequests = [];
  const trStatuses = ['pending', 'approved', 'needs_review', 'rejected', 'approved'];
  for (let t = 0; t < 14; t += 1) {
    const offset = -10 + t;
    if (offset > DAYS_FORWARD) break;
    const i = (t * 7 + 3) % pairCount;
    const trStatus = offset > 0 ? trStatuses[t % 3] : trStatuses[t % trStatuses.length];
    transportRequests.push({
      id: `${P}tr-${t}`,
      tenantId: TENANT_ID,
      driverId: drivers[i].id,
      vehicleId: vehicles[i].id,
      companyId: companies[t % companies.length].id,
      cargoName: CARGOS[t % CARGOS.length].name,
      cargoOwner: CARGOS[t % CARGOS.length].owner,
      pickupAddress: ROUTES[t % ROUTES.length].pickup,
      deliveryAddress: ROUTES[t % ROUTES.length].delivery,
      requestedDate: dateAt(offset),
      startTime: '07:00',
      endTime: '15:30',
      status: trStatus,
      conflictReason:
        trStatus === 'needs_review'
          ? 'Fahrzeug bereits für Tour Nord verplant.'
          : trStatus === 'rejected'
            ? 'Fahrer hat genehmigten Urlaub.'
            : null,
    });
  }
  await insertAll(prisma.transportRequest, transportRequests, 'transportRequests', counters);

  // ── 6. Workshop / service history ─────────────────────────────────────
  const serviceTypes = [
    { type: 'Inspektion', vendor: 'Mercedes-Benz Nutzfahrzeuge Berlin', cost: 890 },
    { type: 'Ölwechsel', vendor: 'Hauswerkstatt Spandau', cost: 210 },
    { type: 'Bremsenwechsel', vendor: 'Bosch Service Neumann', cost: 640 },
    { type: 'Reifenwechsel', vendor: 'Reifen Krämer GmbH', cost: 480 },
    { type: 'HU/AU', vendor: 'TÜV Rheinland Berlin', cost: 165 },
    { type: 'Klimaservice', vendor: 'Hauswerkstatt Spandau', cost: 145 },
  ];
  const serviceRecords = [];
  for (let s = 0; s < 22; s += 1) {
    const plan = serviceTypes[s % serviceTypes.length];
    const i = (s * 3 + 1) % pairCount;
    serviceRecords.push({
      id: `${P}svc-${s}`,
      tenantId: TENANT_ID,
      vehicleId: vehicles[i].id,
      driverId: drivers[i].id,
      date: dateAt(-DAYS_BACK + s),
      serviceType: plan.type,
      vendor: plan.vendor,
      repairCompany: plan.vendor,
      costAmount: plan.cost + s * 7,
      mileageKm: 120000 + s * 3100,
      notes: plan.type === 'HU/AU' ? 'Hauptuntersuchung ohne Mängel bestanden.' : null,
    });
  }
  await insertAll(prisma.serviceRecord, serviceRecords, 'serviceRecords', counters);

  // ── 7. Fines ──────────────────────────────────────────────────────────
  const finePlans = [
    { category: 'speed', type: 'Geschwindigkeitsüberschreitung 21 km/h innerorts', amount: 115, status: 'fahrer_zugeordnet' },
    { category: 'parking', type: 'Parken im Halteverbot', amount: 55, status: 'bezahlt' },
    { category: 'red_light', type: 'Rotlichtverstoß qualifiziert', amount: 200, status: 'fahrer_benachrichtigt' },
    { category: 'distance', type: 'Abstandsunterschreitung auf der BAB', amount: 160, status: 'widerspruch' },
    { category: 'speed', type: 'Geschwindigkeitsüberschreitung 16 km/h außerorts', amount: 70, status: 'neu' },
    { category: 'other', type: 'Handy am Steuer', amount: 100, status: 'abgeschlossen' },
    { category: 'parking', type: 'Parken auf Gehweg', amount: 55, status: 'neu' },
    { category: 'speed', type: 'Geschwindigkeitsüberschreitung 11 km/h innerorts', amount: 50, status: 'bezahlt' },
  ];
  const fines = [];
  for (let f = 0; f < finePlans.length; f += 1) {
    const plan = finePlans[f];
    const i = (f * 6 + 4) % pairCount;
    const offset = -DAYS_BACK + 3 + f * 3;
    fines.push({
      id: `${P}fine-${f}`,
      tenantId: TENANT_ID,
      vehicleId: vehicles[i].id,
      driverId: plan.status === 'neu' ? null : drivers[i].id,
      matchType: plan.status === 'neu' ? 'unmatched' : 'auto',
      violationAt: dayAt(offset, 9 + (f % 8), 15),
      violationLocation: ROUTES[f % ROUTES.length].delivery,
      violationType: plan.type,
      violationCategory: plan.category,
      amount: plan.amount,
      noticeDate: dateAt(offset + 9),
      paymentDueDate: dateAt(offset + 23),
      status: plan.status,
      createdByUserId: adminUser.id,
    });
  }
  await insertAll(prisma.fine, fines, 'fines', counters);

  // ── 8. Accidents / cargo damage ───────────────────────────────────────
  const incidentPlans = [
    { type: 'vehicle_accident', status: 'resolved', offset: -26, description: 'Auffahrunfall im Stau auf der A100, Heckschaden am Transporter.', damage: 3200 },
    { type: 'cargo_damage', status: 'under_review', offset: -19, description: 'Zwei Paletten beim Entladen beschädigt, Folie gerissen.', damage: 640 },
    { type: 'vehicle_accident', status: 'reported', offset: -11, description: 'Streifschaden beim Rangieren an der Laderampe.', damage: 850 },
    { type: 'cargo_damage', status: 'resolved', offset: -7, description: 'Kühlkette unterbrochen, Ware teilweise entsorgt.', damage: 1450 },
    { type: 'vehicle_accident', status: 'under_review', offset: -3, description: 'Steinschlag auf der BAB, Windschutzscheibe gerissen.', damage: 420 },
  ];
  const accidents = [];
  for (let a = 0; a < incidentPlans.length; a += 1) {
    const plan = incidentPlans[a];
    const i = (a * 9 + 5) % pairCount;
    accidents.push({
      id: `${P}acc-${a}`,
      tenantId: TENANT_ID,
      type: plan.type,
      driverId: drivers[i].id,
      vehicleId: vehicles[i].id,
      companyId: companies[a % companies.length].id,
      incidentDateTime: dayAt(plan.offset, 11, 20),
      location: ROUTES[a % ROUTES.length].delivery,
      description: plan.description,
      cargoName: plan.type === 'cargo_damage' ? CARGOS[a % CARGOS.length].name : null,
      cargoOwner: plan.type === 'cargo_damage' ? CARGOS[a % CARGOS.length].owner : null,
      damageValue: plan.damage,
      status: plan.status,
    });
  }
  await insertAll(prisma.accident, accidents, 'accidents', counters);

  // ── 9. Fuel entries ───────────────────────────────────────────────────
  const fuelEntries = [];
  for (let f = 0; f < 90; f += 1) {
    const i = (f * 4 + 6) % pairCount;
    const offset = -DAYS_BACK + (f % DAYS_BACK);
    const liters = 48 + (f % 37);
    fuelEntries.push({
      id: `${P}fuel-${f}`,
      tenantId: TENANT_ID,
      vehicleId: vehicles[i].id,
      driverId: drivers[i].id,
      enteredAt: dayAt(offset, 16, (f * 7) % 60),
      liters,
      totalCost: Number((liters * (1.68 + ((f % 9) - 4) * 0.015)).toFixed(2)),
      currency: 'EUR',
      odometerKm: 120000 + f * 640,
      isFullTank: f % 3 !== 0,
    });
  }
  await insertAll(prisma.fleetFuelEntry, fuelEntries, 'fuelEntries', counters);

  // ── 10. Documents + reminders ─────────────────────────────────────────
  const documents = [];
  const reminders = [];
  for (let i = 0; i < Math.min(drivers.length, 24); i += 1) {
    const driver = drivers[i];
    const expiry = dateAt(i % 9 === 0 ? -10 + i : 60 + i * 12);
    documents.push({
      id: `${P}doc-drv-${i}`,
      tenantId: TENANT_ID,
      ownerType: 'driver',
      ownerId: driver.id,
      documentType: 'Führerschein',
      fileName: `fuehrerschein-${driver.employeeNumber}.pdf`,
      expiryDate: expiry,
      status: expiry.getTime() < Date.now() ? 'expired' : 'valid',
      uploadedById: adminUser.id,
    });
    reminders.push({
      id: `${P}rem-drv-${i}`,
      tenantId: TENANT_ID,
      targetType: 'driver',
      targetId: driver.id,
      reminderType: 'license_expiry',
      title: `Führerschein läuft ab — ${driver.firstName} ${driver.lastName}`,
      description: 'Führerscheinkontrolle rechtzeitig einplanen.',
      dueDate: expiry,
      notifyBeforeDays: 30,
      status: expiry.getTime() < Date.now() ? 'sent' : 'open',
    });
  }
  for (let i = 0; i < Math.min(vehicles.length, 24); i += 1) {
    const vehicle = vehicles[i];
    const expiry = dateAt(i % 7 === 0 ? -5 + i : 40 + i * 15);
    documents.push({
      id: `${P}doc-veh-${i}`,
      tenantId: TENANT_ID,
      ownerType: 'vehicle',
      ownerId: vehicle.id,
      documentType: 'HU-Bericht',
      fileName: `hu-bericht-${vehicle.plateNumber.replace(/\s+/g, '-')}.pdf`,
      expiryDate: expiry,
      status: expiry.getTime() < Date.now() ? 'expired' : 'valid',
      uploadedById: adminUser.id,
    });
    reminders.push({
      id: `${P}rem-veh-${i}`,
      tenantId: TENANT_ID,
      targetType: 'vehicle',
      targetId: vehicle.id,
      reminderType: 'tuv_expiry',
      title: `HU fällig — ${vehicle.plateNumber}`,
      description: 'Hauptuntersuchung beim TÜV terminieren.',
      dueDate: expiry,
      notifyBeforeDays: 45,
      status: expiry.getTime() < Date.now() ? 'sent' : 'open',
    });
  }
  await insertAll(prisma.document, documents, 'documents', counters);
  await insertAll(prisma.reminder, reminders, 'reminders', counters);

  const window = `${dateAt(-DAYS_BACK).toISOString().slice(0, 10)} … ${dateAt(DAYS_FORWARD).toISOString().slice(0, 10)}`;
  console.log(`[seed-demo-month] tenant=${TENANT_ID} window=${window}`);
  console.log('[seed-demo-month] done:', counters);
}

main()
  .catch((error) => {
    console.error('[seed-demo-month] failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
