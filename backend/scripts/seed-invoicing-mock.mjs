#!/usr/bin/env node
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = process.env.SEED_TENANT_ID?.trim() || 'default-tenant';
const MARKER = '[MOCK-INVOICING]';

function startOfUtcDay(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function formatDay(date) {
  return date.toISOString().slice(0, 10);
}

function taxHalfUp(netCents, basisPoints) {
  const scaled = BigInt(netCents) * BigInt(basisPoints);
  const rounded = (scaled + 5_000n) / 10_000n;
  return Number(rounded);
}

function ensureSafeInt(value, label) {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} is outside safe integer range`);
  }
}

async function purgePreviousMockData(tenantId) {
  const mockInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      notes: { startsWith: MARKER },
    },
    select: { id: true },
  });

  const invoiceIds = mockInvoices.map((row) => row.id);
  if (invoiceIds.length > 0) {
    const lines = await prisma.invoiceLine.findMany({
      where: { invoiceId: { in: invoiceIds } },
      select: { id: true },
    });
    const lineIds = lines.map((line) => line.id);

    if (lineIds.length > 0) {
      await prisma.invoiceAssignmentClaim.deleteMany({ where: { invoiceLineId: { in: lineIds } } });
    }
    await prisma.invoiceAuditEvent.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoiceDeliveryAttempt.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoicePayment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.dunningNotice.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  }

  await prisma.assignment.deleteMany({
    where: {
      tenantId,
      notes: { startsWith: MARKER },
    },
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Mock seeding is disabled in production');
  }

  const actor = await prisma.user.findFirst({
    where: {
      tenantId: TENANT_ID,
      role: { in: ['boss', 'accounting', 'admin'] },
      status: 'active',
    },
    select: { id: true, email: true },
  });
  if (!actor) {
    throw new Error(`No active boss/accounting/admin user found for tenant ${TENANT_ID}`);
  }

  const drivers = await prisma.driver.findMany({
    where: { tenantId: TENANT_ID, status: 'active' },
    select: { id: true },
    take: 12,
    orderBy: { createdAt: 'asc' },
  });
  const vehicles = await prisma.vehicle.findMany({
    where: { tenantId: TENANT_ID, status: 'active' },
    select: { id: true },
    take: 12,
    orderBy: { createdAt: 'asc' },
  });
  if (drivers.length < 3 || vehicles.length < 3) {
    throw new Error('Need at least 3 active drivers and 3 active vehicles in tenant seed data');
  }

  const companies = await prisma.company.findMany({
    where: { tenantId: TENANT_ID },
    select: {
      id: true,
      name: true,
      email: true,
      billingName: true,
      billingStreet: true,
      billingPostalCode: true,
      billingCity: true,
      billingCountryCode: true,
      vatId: true,
      invoiceEmail: true,
      defaultTaxCategory: true,
      defaultPaymentTermDays: true,
      defaultDailyRevenue: true,
    },
    orderBy: { createdAt: 'asc' },
    take: 4,
  });
  if (companies.length === 0) {
    throw new Error(`No companies found for tenant ${TENANT_ID}`);
  }

  await purgePreviousMockData(TENANT_ID);

  await prisma.tenantBillingProfile.upsert({
    where: { tenantId: TENANT_ID },
    update: {
      legalName: 'Fleet Operations GmbH',
      street: 'Musterstrasse 1',
      postalCode: '10115',
      city: 'Berlin',
      countryCode: 'DE',
      taxNumber: '12/345/67890',
      vatId: 'DE123456789',
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      bankName: 'Commerzbank',
      invoiceNumberFormat: 'RE-{YYYY}-{00001}',
      defaultPaymentTermDays: 14,
      defaultTaxRateBasisPoints: 1900,
      smallBusinessRule: false,
      invoiceFooterText: 'Vielen Dank fuer Ihren Auftrag.',
      invoiceEmailCc: 'accounting@fleet.local',
      dunningEnabled: true,
      dunningLevel1Days: 1,
      dunningLevel2Days: 14,
      dunningLevel3Days: 28,
      dunningLevel1FeeCents: 0,
      dunningLevel2FeeCents: 500,
      dunningLevel3FeeCents: 1000,
    },
    create: {
      tenantId: TENANT_ID,
      legalName: 'Fleet Operations GmbH',
      street: 'Musterstrasse 1',
      postalCode: '10115',
      city: 'Berlin',
      countryCode: 'DE',
      taxNumber: '12/345/67890',
      vatId: 'DE123456789',
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      bankName: 'Commerzbank',
      invoiceNumberFormat: 'RE-{YYYY}-{00001}',
      defaultPaymentTermDays: 14,
      defaultTaxRateBasisPoints: 1900,
      smallBusinessRule: false,
      invoiceFooterText: 'Vielen Dank fuer Ihren Auftrag.',
      invoiceEmailCc: 'accounting@fleet.local',
      dunningEnabled: true,
      dunningLevel1Days: 1,
      dunningLevel2Days: 14,
      dunningLevel3Days: 28,
      dunningLevel1FeeCents: 0,
      dunningLevel2FeeCents: 500,
      dunningLevel3FeeCents: 1000,
    },
  });

  const today = startOfUtcDay();
  const monday = addDays(today, -((today.getUTCDay() + 6) % 7));
  const lastMonday = addDays(monday, -7);

  const invoiceRows = [];

  for (let i = 0; i < companies.length; i += 1) {
    const company = companies[i];
    const driverA = drivers[(i * 2) % drivers.length];
    const driverB = drivers[(i * 2 + 1) % drivers.length];
    const vehicleA = vehicles[(i * 2) % vehicles.length];
    const vehicleB = vehicles[(i * 2 + 1) % vehicles.length];

    await prisma.company.update({
      where: { id: company.id },
      data: {
        billingName: company.billingName ?? company.name,
        billingStreet: company.billingStreet ?? 'Industriestrasse 12',
        billingPostalCode: company.billingPostalCode ?? '20095',
        billingCity: company.billingCity ?? 'Hamburg',
        billingCountryCode: company.billingCountryCode || 'DE',
        vatId: company.vatId ?? `DE99999${String(100 + i)}`,
        invoiceEmail: company.invoiceEmail ?? company.email ?? `rechnung+${i + 1}@kunde.local`,
        defaultPaymentTermDays: company.defaultPaymentTermDays ?? 14,
      },
    });

    const createdAssignments = [];
    for (let j = 0; j < 4; j += 1) {
      const isCurrentWeek = j < 2;
      const workDate = isCurrentWeek ? addDays(monday, j + 1) : addDays(lastMonday, j - 1);
      const amountCents = 95000 + i * 7000 + j * 3500;
      const expectedDailyRevenue = (amountCents / 100).toFixed(2);
      const assignment = await prisma.assignment.create({
        data: {
          tenantId: TENANT_ID,
          driverId: j % 2 === 0 ? driverA.id : driverB.id,
          vehicleId: j % 2 === 0 ? vehicleA.id : vehicleB.id,
          companyId: company.id,
          cargoName: `${MARKER} Tour ${j + 1}`,
          cargoOwner: company.name,
          pickupAddress: 'Berlin Lager 1',
          deliveryAddress: 'Hamburg Hub 7',
          routeName: 'Berlin - Hamburg',
          workDate,
          startTime: '08:00',
          endTime: '16:00',
          expectedDailyRevenue,
          status: 'completed',
          notes: `${MARKER} assignment for invoice demo`,
          createdById: actor.id,
        },
      });
      createdAssignments.push({ assignment, amountCents });
    }

    const weeklyGroups = [
      {
        label: 'current-week',
        assignmentSlice: createdAssignments.slice(0, 2),
        invoiceDate: addDays(monday, 5),
        status: 'sent',
      },
      {
        label: 'previous-week',
        assignmentSlice: createdAssignments.slice(2, 4),
        invoiceDate: addDays(lastMonday, 5),
        status: 'paid',
      },
    ];

    for (const [idx, group] of weeklyGroups.entries()) {
      const servicePeriodStart = group.assignmentSlice.reduce(
        (min, row) => (row.assignment.workDate < min ? row.assignment.workDate : min),
        group.assignmentSlice[0].assignment.workDate,
      );
      const servicePeriodEnd = group.assignmentSlice.reduce(
        (max, row) => (row.assignment.workDate > max ? row.assignment.workDate : max),
        group.assignmentSlice[0].assignment.workDate,
      );

      const netCents = group.assignmentSlice.reduce((sum, row) => sum + row.amountCents, 0);
      const taxCents = taxHalfUp(netCents, 1900);
      const grossCents = netCents + taxCents;
      ensureSafeInt(netCents, 'netCents');
      ensureSafeInt(taxCents, 'taxCents');
      ensureSafeInt(grossCents, 'grossCents');

      const invoiceNumber = `MOCK-${group.invoiceDate.getUTCFullYear()}-${String(i + 1).padStart(2, '0')}${String(idx + 1).padStart(2, '0')}`;
      const dueDate = addDays(group.invoiceDate, 14);

      const created = await prisma.invoice.create({
        data: {
          tenantId: TENANT_ID,
          companyId: company.id,
          kind: 'invoice',
          status: group.status,
          number: invoiceNumber,
          invoiceDate: group.invoiceDate,
          servicePeriodStart,
          servicePeriodEnd,
          paymentTermDays: 14,
          dueDate,
          currency: 'EUR',
          netCents,
          taxCents,
          grossCents,
          paidCents: group.status === 'paid' ? grossCents : 0,
          // Same shape calculateInvoiceTotals() produces in src/invoicing/money.ts —
          // an array of entries carrying their own category and rate. Mock data that
          // keys the rate into an object instead crashes the invoice detail page.
          taxBreakdown: [
            {
              taxCategory: 'standard',
              taxRateBasisPoints: 1900,
              netCents,
              taxCents,
              grossCents,
            },
          ],
          customerName: company.billingName ?? company.name,
          customerStreet: company.billingStreet ?? 'Industriestrasse 12',
          customerPostalCode: company.billingPostalCode ?? '20095',
          customerCity: company.billingCity ?? 'Hamburg',
          customerCountryCode: company.billingCountryCode || 'DE',
          customerVatId: company.vatId,
          customerEmail: company.invoiceEmail ?? company.email,
          notes: `${MARKER} ${group.label} company=${company.name}`,
          finalizedAt: group.invoiceDate,
          sentAt: group.status === 'sent' || group.status === 'paid' ? addDays(group.invoiceDate, 1) : null,
          paidAt: group.status === 'paid' ? addDays(group.invoiceDate, 6) : null,
          createdById: actor.id,
          finalizedById: actor.id,
          lines: {
            create: group.assignmentSlice.map((row, lineIndex) => {
              const lineNetCents = row.amountCents;
              const lineTaxCents = taxHalfUp(lineNetCents, 1900);
              const lineGrossCents = lineNetCents + lineTaxCents;
              return {
                position: lineIndex + 1,
                description: `Transportleistung ${formatDay(row.assignment.workDate)}`,
                quantity: '1',
                unit: 'tour',
                unitPriceCents: lineNetCents,
                taxRateBasisPoints: 1900,
                taxCategory: 'standard',
                netCents: lineNetCents,
                taxCents: lineTaxCents,
                grossCents: lineGrossCents,
                source: 'assignment',
                assignment: { connect: { id: row.assignment.id } },
                serviceDate: row.assignment.workDate,
                sourceSnapshot: {
                  marker: MARKER,
                  assignmentId: row.assignment.id,
                  workDate: row.assignment.workDate.toISOString(),
                },
              };
            }),
          },
        },
        include: {
          lines: {
            select: { id: true, assignmentId: true },
            orderBy: { position: 'asc' },
          },
        },
      });

      if (group.status === 'paid') {
        await prisma.invoicePayment.create({
          data: {
            tenantId: TENANT_ID,
            invoiceId: created.id,
            amountCents: grossCents,
            paidAt: addDays(group.invoiceDate, 6),
            method: 'bank_transfer',
            reference: `${MARKER}-PAY-${created.number}`,
            note: 'Mock payment for invoicing dashboard',
            recordedById: actor.id,
          },
        });
      }

      await prisma.invoiceAuditEvent.create({
        data: {
          tenantId: TENANT_ID,
          invoiceId: created.id,
          actorUserId: actor.id,
          action: `${MARKER}.created`,
          snapshot: {
            companyId: company.id,
            invoiceNumber: created.number,
            lineCount: created.lines.length,
            status: group.status,
          },
        },
      });

      for (const line of created.lines) {
        if (!line.assignmentId) continue;
        await prisma.invoiceAssignmentClaim.create({
          data: {
            tenantId: TENANT_ID,
            assignmentId: line.assignmentId,
            invoiceLineId: line.id,
          },
        });
      }

      invoiceRows.push({
        company: company.name,
        invoiceId: created.id,
        number: created.number,
        status: group.status,
        grossCents,
        invoiceDate: formatDay(group.invoiceDate),
      });
    }
  }

  console.info(
    JSON.stringify(
      {
        tenantId: TENANT_ID,
        actor: actor.email,
        invoicesCreated: invoiceRows.length,
        invoices: invoiceRows,
        whereToCheck: {
          list: '/api/v1/invoicing/invoices',
          dailySummary: '/api/v1/invoicing/invoices/summary/by-company?groupBy=day',
          weeklySummary: '/api/v1/invoicing/invoices/summary/by-company?groupBy=week',
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
