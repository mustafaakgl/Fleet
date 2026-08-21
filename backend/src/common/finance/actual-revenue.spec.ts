import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InvoiceKind, OutgoingInvoiceStatus } from '@prisma/client';
import { ActualRevenueService } from './actual-revenue.service';

/**
 * GERCEK gelirin TEK okuma yolu.
 *
 * Prisma MOCK ama servisin GONDERDIGI `where`i saklıyor: "taslak fatura
 * disarida" iddiasi ancak filtrenin gercekten gonderildigi olculursek bir
 * sey ifade eder — taklidin kendi kuralini uydurmasi testi bosaltirdi.
 */

interface Line {
  netCents: number;
  serviceDate: string | null;
  invoiceDate: string;
  vehicleId: string | null;
  companyId?: string;
  currency?: string;
  kind?: InvoiceKind;
}

function build(lines: Line[]) {
  let seenWhere: Record<string, unknown> | null = null;
  const prisma = {
    invoiceLine: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        seenWhere = args.where;
        return lines.map((line) => ({
          netCents: line.netCents,
          serviceDate: line.serviceDate === null ? null : new Date(line.serviceDate),
          assignment: line.vehicleId === null ? null : { vehicleId: line.vehicleId },
          invoice: {
            invoiceDate: new Date(line.invoiceDate),
            currency: line.currency ?? 'EUR',
            companyId: line.companyId ?? 'c1',
            kind: line.kind ?? InvoiceKind.invoice,
          },
        }));
      },
    },
  };
  return {
    service: new ActualRevenueService(prisma as never),
    where: () => seenWhere as Record<string, unknown> | null,
  };
}

const FROM = new Date('2026-06-01T00:00:00Z');
const TO = new Date('2026-07-01T00:00:00Z');

describe('gercek gelir — fatura filtresi', () => {
  it('TASLAK ve IPTAL faturayi sorguda DISARIDA birakir', async () => {
    const { service, where } = build([]);
    await service.collect(FROM, TO, 'EUR');

    const statuses = (where()!.invoice as { status: { in: OutgoingInvoiceStatus[] } }).status.in;
    assert.equal(statuses.includes(OutgoingInvoiceStatus.draft), false);
    assert.equal(statuses.includes(OutgoingInvoiceStatus.cancelled), false);
    // Numara verilmis fatura tahsil edilmemis olsa da gercek gelirdir.
    assert.equal(statuses.includes(OutgoingInvoiceStatus.finalized), true);
  });

  it('DONEM OLCUTU hizmet tarihi; yoksa fatura tarihine duser', async () => {
    const { service, where } = build([]);
    await service.collect(FROM, TO, 'EUR');

    const or = where()!.OR as Array<Record<string, unknown>>;
    // Gec kesilen bir fatura AIT OLDUGU aya yazilmali; yoksa donemler
    // faturalama hizina gore kayar.
    assert.deepEqual(or[0]!.serviceDate, { gte: FROM, lt: TO });
    assert.equal(or[1]!.serviceDate, null);
    assert.deepEqual(
      (or[1]!.invoice as { invoiceDate: unknown }).invoiceDate,
      { gte: FROM, lt: TO },
    );
  });

  it('arac filtresi GOREV uzerinden cozulur', async () => {
    const { service, where } = build([]);
    await service.collect(FROM, TO, 'EUR', { vehicleId: 'v1' });
    assert.deepEqual(where()!.assignment, { vehicleId: 'v1' });
  });
});

describe('gercek gelir — tutar', () => {
  it('NET tutar toplanir, cents ana birime cevrilir', async () => {
    const { service } = build([
      {
        netCents: 123_45,
        serviceDate: '2026-06-10T00:00:00Z',
        invoiceDate: '2026-06-30T00:00:00Z',
        vehicleId: 'v1',
      },
    ]);
    const result = await service.collect(FROM, TO, 'EUR');
    assert.equal(result.rows[0]!.amount, 123.45);
  });

  it('alacak dekontu ve iptal faturasi EKSI isaretle sayilir', async () => {
    const { service } = build([
      { netCents: 100_000, serviceDate: '2026-06-10T00:00:00Z', invoiceDate: '2026-06-10T00:00:00Z', vehicleId: 'v1' },
      {
        netCents: 20_000,
        serviceDate: '2026-06-11T00:00:00Z',
        invoiceDate: '2026-06-11T00:00:00Z',
        vehicleId: 'v1',
        kind: InvoiceKind.credit_note,
      },
    ]);
    assert.equal(await service.total(FROM, TO, 'EUR'), 800);
  });

  it('temel para birimi disindaki fatura toplama GIRMEZ ama SAYILIR', async () => {
    const { service } = build([
      { netCents: 100_000, serviceDate: '2026-06-10T00:00:00Z', invoiceDate: '2026-06-10T00:00:00Z', vehicleId: 'v1' },
      {
        netCents: 4_500_000,
        serviceDate: '2026-06-11T00:00:00Z',
        invoiceDate: '2026-06-11T00:00:00Z',
        vehicleId: 'v1',
        currency: 'TRY',
      },
    ]);
    const result = await service.collect(FROM, TO, 'EUR');
    assert.equal(result.rows.length, 1);
    // Kur UYDURULMUYOR; kayit SILINMIYOR.
    assert.deepEqual(result.unconvertedByCurrency, [
      { currency: 'TRY', amount: 45000, count: 1 },
    ]);
  });

  it('goreve baglanmayan satir ayri SAYILIR ve araca yazilmaz', async () => {
    const { service } = build([
      { netCents: 50_000, serviceDate: '2026-06-10T00:00:00Z', invoiceDate: '2026-06-10T00:00:00Z', vehicleId: null },
    ]);
    const result = await service.collect(FROM, TO, 'EUR');
    assert.equal(result.rows[0]!.vehicleId, null);
    assert.equal(result.withoutVehicleAmount, 500);
    assert.equal(result.withoutVehicleCount, 1);
  });

  it('hizmet tarihi yoksa donem olcutu fatura tarihi olur', async () => {
    const { service } = build([
      { netCents: 10_000, serviceDate: null, invoiceDate: '2026-06-20T00:00:00Z', vehicleId: 'v1' },
    ]);
    const result = await service.collect(FROM, TO, 'EUR');
    assert.equal(result.rows[0]!.at.toISOString(), '2026-06-20T00:00:00.000Z');
  });
});

describe('gercek gelir — para birimi ve tip', () => {
  it('Decimal degil NUMBER doner ve iki hane korunur', async () => {
    const { service } = build([
      { netCents: 33_33, serviceDate: '2026-06-10T00:00:00Z', invoiceDate: '2026-06-10T00:00:00Z', vehicleId: 'v1' },
      { netCents: 33_33, serviceDate: '2026-06-10T00:00:00Z', invoiceDate: '2026-06-10T00:00:00Z', vehicleId: 'v1' },
      { netCents: 33_34, serviceDate: '2026-06-10T00:00:00Z', invoiceDate: '2026-06-10T00:00:00Z', vehicleId: 'v1' },
    ]);
    const total = await service.total(FROM, TO, 'EUR');
    assert.equal(total, 100);
    // Sozlesme NUMBER: tuketiciler (pano, grafik, CSV) hepsi ayni olcegi
    // gormeli; Decimal sizsaydi bazi ekranlar `.toFixed` alamazdi.
    assert.equal(typeof total, 'number');
  });
});
