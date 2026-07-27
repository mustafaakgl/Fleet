import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

const YEAR_TOKEN = '{YYYY}';
const SEQUENCE_TOKEN = /\{(0{0,11}1)\}/g;

export type InvoiceNumberTransaction = {
  $queryRaw(query: Prisma.Sql): Promise<Array<{ lastValue: number }>>;
};

export function formatInvoiceNumber(format: string, year: number, value: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError('year must be a four-digit integer');
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError('invoice sequence value must be a positive safe integer');
  }
  if (!format.includes(YEAR_TOKEN)) {
    throw new RangeError(`invoice number format must contain ${YEAR_TOKEN}`);
  }

  const matches = [...format.matchAll(SEQUENCE_TOKEN)];
  if (matches.length !== 1) {
    throw new RangeError('invoice number format must contain exactly one sequence token like {00001}');
  }

  const width = matches[0][1].length;
  const sequence = String(value);
  if (sequence.length > width) {
    throw new RangeError(`invoice sequence ${value} exceeds configured width ${width}`);
  }

  return format
    .replace(YEAR_TOKEN, String(year))
    .replace(matches[0][0], sequence.padStart(width, '0'));
}

/**
 * Must be called inside the same database transaction that finalizes the invoice.
 * PostgreSQL serializes the upsert on (tenantId, year); a transaction rollback also
 * rolls back lastValue, so failed finalizations do not consume a number.
 */
export async function allocateInvoiceNumber(
  tx: InvoiceNumberTransaction,
  tenantId: string,
  invoiceDate: Date,
  format: string,
): Promise<{ number: string; sequenceValue: number; year: number }> {
  if (!tenantId.trim()) {
    throw new RangeError('tenantId is required');
  }
  if (Number.isNaN(invoiceDate.getTime())) {
    throw new RangeError('invoiceDate is invalid');
  }

  const year = invoiceDate.getUTCFullYear();
  const rows = await tx.$queryRaw(Prisma.sql`
    INSERT INTO "InvoiceNumberSequence"
      ("id", "tenantId", "year", "lastValue", "createdAt", "updatedAt")
    VALUES
      (${randomUUID()}, ${tenantId}, ${year}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("tenantId", "year")
    DO UPDATE SET
      "lastValue" = "InvoiceNumberSequence"."lastValue" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "lastValue"
  `);

  const sequenceValue = rows[0]?.lastValue;
  if (!sequenceValue) {
    throw new Error('Invoice number sequence allocation returned no value');
  }

  return {
    number: formatInvoiceNumber(format, year, sequenceValue),
    sequenceValue,
    year,
  };
}
