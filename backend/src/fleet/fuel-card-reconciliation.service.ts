import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListFuelCardTransactionsQueryDto } from './dto/list-fuel-card-transactions.query';

export type FuelCardImportBatchSummary = {
  id: string;
  sourceFileName: string;
  sourceStoredPath: string | null;
  sourceMimeType: string | null;
  importedAt: string;
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  ignoredRows: number;
  transactionCount: number;
  createdAt: string;
  updatedAt: string;
};

export type FuelCardTransactionSummary = {
  id: string;
  batchId: string;
  sourceFileName: string;
  vehicleId: string | null;
  plateNumber: string | null;
  driverId: string | null;
  driverName: string | null;
  fuelEntryId: string | null;
  matchedFuelEntryAt: string | null;
  externalReference: string | null;
  cardLast4: string | null;
  merchantName: string;
  transactionAt: string;
  liters: number | null;
  amount: number;
  currency: string;
  odometerKm: number | null;
  status: string;
  matchScore: number | null;
  matchNote: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class FuelCardReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async listImportBatches(): Promise<FuelCardImportBatchSummary[]> {
    const batches = await this.prisma.fuelCardImportBatch.findMany({
      orderBy: { importedAt: 'desc' },
      take: 200,
      include: {
        _count: { select: { transactions: true } },
      },
    });

    return batches.map((batch) => ({
      id: batch.id,
      sourceFileName: batch.sourceFileName,
      sourceStoredPath: batch.sourceStoredPath,
      sourceMimeType: batch.sourceMimeType,
      importedAt: batch.importedAt.toISOString(),
      totalRows: batch.totalRows,
      matchedRows: batch.matchedRows,
      unmatchedRows: batch.unmatchedRows,
      ignoredRows: batch.ignoredRows,
      transactionCount: batch._count.transactions,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    }));
  }

  async listTransactions(query: ListFuelCardTransactionsQueryDto): Promise<FuelCardTransactionSummary[]> {
    const where: Prisma.FuelCardTransactionWhereInput = {};
    if (query.batchId) where.batchId = query.batchId;
    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.driverId) where.driverId = query.driverId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.transactionAt = this.buildDateFilter(query.from, query.to);
    }

    const rows = await this.prisma.fuelCardTransaction.findMany({
      where,
      orderBy: { transactionAt: 'desc' },
      take: 500,
      include: {
        batch: { select: { sourceFileName: true } },
        vehicle: { select: { plateNumber: true } },
        driver: { select: { firstName: true, lastName: true } },
        fuelEntry: { select: { id: true, enteredAt: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      batchId: row.batchId,
      sourceFileName: row.batch.sourceFileName,
      vehicleId: row.vehicleId,
      plateNumber: row.vehicle?.plateNumber ?? null,
      driverId: row.driverId,
      driverName: row.driver ? `${row.driver.firstName} ${row.driver.lastName}`.trim() : null,
      fuelEntryId: row.fuelEntryId,
      matchedFuelEntryAt: row.fuelEntry?.enteredAt.toISOString() ?? null,
      externalReference: row.externalReference,
      cardLast4: row.cardLast4,
      merchantName: row.merchantName,
      transactionAt: row.transactionAt.toISOString(),
      liters: row.liters != null ? Number(row.liters) : null,
      amount: Number(row.amount),
      currency: row.currency,
      odometerKm: row.odometerKm != null ? Number(row.odometerKm) : null,
      status: row.status,
      matchScore: row.matchScore,
      matchNote: row.matchNote,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async getBatchById(batchId: string): Promise<FuelCardImportBatchSummary> {
    const batch = await this.prisma.fuelCardImportBatch.findUnique({
      where: { id: batchId },
      include: { _count: { select: { transactions: true } } },
    });
    if (!batch) {
      throw new NotFoundException('Fuel card import batch not found');
    }

    return {
      id: batch.id,
      sourceFileName: batch.sourceFileName,
      sourceStoredPath: batch.sourceStoredPath,
      sourceMimeType: batch.sourceMimeType,
      importedAt: batch.importedAt.toISOString(),
      totalRows: batch.totalRows,
      matchedRows: batch.matchedRows,
      unmatchedRows: batch.unmatchedRows,
      ignoredRows: batch.ignoredRows,
      transactionCount: batch._count.transactions,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    };
  }

  private buildDateFilter(from?: string, to?: string): Prisma.DateTimeFilter {
    const transactionAt: Prisma.DateTimeFilter = {};
    if (from) {
      transactionAt.gte = new Date(from);
    }
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      transactionAt.lte = end;
    }
    return transactionAt;
  }
}
