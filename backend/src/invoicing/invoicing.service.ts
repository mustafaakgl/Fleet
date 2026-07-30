import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  DatevExportStatus,
  EInvoicePreference,
  InvoiceLineSource,
  InvoiceKind,
  InvoiceTaxCategory,
  InvoiceUnit,
  OutgoingInvoiceStatus,
  Prisma,
} from '@prisma/client';
import type { Readable } from 'node:stream';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { invoiceDeliveryMail } from '../mail/mail-templates';
import { MailService, type MailAttachment, type SendMailResult } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { DatevExportStorageService } from '../storage/datev-export-storage.service';
import { InvoiceDocumentStorageService } from '../storage/invoice-document-storage.service';
import {
  buildEInvoiceDocument,
  EInvoiceValidationError,
  renderInvoiceDocuments,
  requiresUbl,
  type EInvoiceTaxGroup,
  type FinalizedInvoiceSnapshot,
  type FinalizedLineSnapshot,
  type SupplierSnapshot,
} from './einvoice';
import { CreateInvoicePaymentDto } from './dto/create-invoice-payment.dto';
import { CreateInvoiceDraftDto, ManualInvoiceLineDto } from './dto/create-invoice-draft.dto';
import { SendInvoiceDto } from './dto/send-invoice.dto';
import { UpdateInvoiceDraftDto } from './dto/update-invoice-draft.dto';
import { UpdateInvoiceLineDto } from './dto/update-invoice-line.dto';
import { UpsertBillingProfileDto } from './dto/upsert-billing-profile.dto';
import { allocateInvoiceNumber, formatInvoiceNumber } from './invoice-number';
import {
  calculateInvoiceTotals,
  calculateLine,
  formatMilliunits,
  parseQuantityToMilliunits,
  type InvoiceTaxCategoryValue,
} from './money';
import {
  renderDebtorMasterCsv,
  renderExtfBuchungsstapelCsv,
  type DatevInvoiceExportInput,
  type DatevTaxCategory,
} from './datev/extf';

const DEFAULT_PAYMENT_TERM_DAYS = 14;
const DEFAULT_TAX_RATE_BASIS_POINTS = 1_900;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Mandatory statement on every invoice issued under the German small business rule. */
const SMALL_BUSINESS_NOTE =
  'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).';

/** Statuses that still block an assignment from ever reaching the invoicing pipeline. */
const OPEN_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.planned,
  AssignmentStatus.confirmed,
  AssignmentStatus.in_progress,
];

function normalizeDay(value: string | Date, label: string): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${label} is invalid`);
  }
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function normalizeTimestamp(value: string | Date, label: string): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${label} is invalid`);
  }
  return date;
}

function decimalEuroToCents(value: Prisma.Decimal | null): number | null {
  if (value === null) return null;
  const cents = value.mul(100);
  if (!cents.isInteger() || cents.isNegative()) {
    throw new BadRequestException('Assignment revenue must have at most two decimal places and be non-negative');
  }
  const result = cents.toNumber();
  if (!Number.isSafeInteger(result)) {
    throw new BadRequestException('Assignment revenue is outside the supported range');
  }
  return result;
}

function taxRateForCategory(
  category: InvoiceTaxCategory,
  defaultTaxRateBasisPoints: number,
): number {
  if (category === InvoiceTaxCategory.standard) return defaultTaxRateBasisPoints;
  if (category === InvoiceTaxCategory.reduced) return 700;
  return 0;
}

/** Appends a mandatory legal note without duplicating it on repeated writes. */
function appendNote(notes: string | null, note: string): string {
  const current = notes?.trim();
  if (!current) return note;
  return current.includes(note) ? current : `${current}\n${note}`;
}

/** Reads one string field out of a stored JSON snapshot without trusting its shape. */
function readSnapshotString(snapshot: Prisma.JsonValue | null, key: string): string | null {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const value = snapshot[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Audit metadata must not carry the customer's full address, only where the mail went. */
function emailDomain(email: string): string {
  return email.split('@')[1] ?? 'unknown';
}

type DatevExportTaxBucket = {
  taxCategory: DatevTaxCategory;
  taxRateBasisPoints: number;
  grossCents: number;
};

function isDatevTaxCategory(value: string): value is DatevTaxCategory {
  return (
    value === 'standard' ||
    value === 'reduced' ||
    value === 'exempt' ||
    value === 'reverse_charge'
  );
}

function readDatevTaxBuckets(value: Prisma.JsonValue | null): DatevExportTaxBucket[] {
  if (!Array.isArray(value)) return [];

  const buckets: DatevExportTaxBucket[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;

    const category = entry.taxCategory;
    const rate = entry.taxRateBasisPoints;
    const gross = entry.grossCents;

    if (
      typeof category !== 'string' ||
      !isDatevTaxCategory(category) ||
      typeof rate !== 'number' ||
      typeof gross !== 'number'
    ) {
      continue;
    }

    buckets.push({
      taxCategory: category,
      taxRateBasisPoints: rate,
      grossCents: gross,
    });
  }

  return buckets;
}

function isExportableInvoiceStatus(status: OutgoingInvoiceStatus): boolean {
  return status !== OutgoingInvoiceStatus.draft;
}

function assertTaxCombination(category: InvoiceTaxCategory, rate: number): void {
  calculateLine({
    quantityMilliunits: 1_000,
    unitPriceCents: 0,
    taxRateBasisPoints: rate,
    taxCategory: category as InvoiceTaxCategoryValue,
  });
}

/** Money helpers signal invalid input with RangeError; the API must answer 400, not 500. */
function asBadRequest<T>(compute: () => T): T {
  try {
    return compute();
  } catch (error) {
    if (error instanceof RangeError) throw new BadRequestException(error.message);
    throw error;
  }
}

@Injectable()
export class InvoicingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly invoiceDocuments: InvoiceDocumentStorageService,
    private readonly datevExportStorage: DatevExportStorageService,
    private readonly mailService: MailService,
  ) {}

  async getBillingProfile() {
    return this.prisma.tenantBillingProfile.findFirst();
  }

  async upsertBillingProfile(
    tenantId: string,
    dto: UpsertBillingProfileDto,
    actorUserId: string,
  ) {
    formatInvoiceNumber(dto.invoiceNumberFormat, new Date().getUTCFullYear(), 1);
    if (dto.dunningLevel2Days <= dto.dunningLevel1Days) {
      throw new BadRequestException('Dunning level 2 must occur after level 1');
    }
    if (dto.dunningLevel3Days <= dto.dunningLevel2Days) {
      throw new BadRequestException('Dunning level 3 must occur after level 2');
    }
    if (!dto.taxNumber?.trim() && !dto.vatId?.trim()) {
      throw new BadRequestException('Tax number or VAT ID is required');
    }

    const data = {
      legalName: dto.legalName.trim(),
      street: dto.street.trim(),
      postalCode: dto.postalCode.trim(),
      city: dto.city.trim(),
      countryCode: dto.countryCode,
      taxNumber: dto.taxNumber?.trim() || null,
      vatId: dto.vatId?.trim() || null,
      registrationNumber: dto.registrationNumber?.trim() || null,
      phone: dto.phone?.trim() || null,
      iban: dto.iban.replace(/\s+/g, '').toUpperCase(),
      bic: dto.bic?.replace(/\s+/g, '').toUpperCase() || null,
      bankName: dto.bankName?.trim() || null,
      invoiceNumberFormat: dto.invoiceNumberFormat.trim(),
      defaultPaymentTermDays: dto.defaultPaymentTermDays,
      defaultTaxRateBasisPoints: dto.smallBusinessRule ? 0 : dto.defaultTaxRateBasisPoints,
      smallBusinessRule: dto.smallBusinessRule,
      invoiceFooterText: dto.invoiceFooterText?.trim() || null,
      invoiceEmailCc: dto.invoiceEmailCc?.trim().toLowerCase() || null,
      dunningEnabled: dto.dunningEnabled,
      dunningLevel1Days: dto.dunningLevel1Days,
      dunningLevel2Days: dto.dunningLevel2Days,
      dunningLevel3Days: dto.dunningLevel3Days,
      dunningLevel1FeeCents: dto.dunningLevel1FeeCents,
      dunningLevel2FeeCents: dto.dunningLevel2FeeCents,
      dunningLevel3FeeCents: dto.dunningLevel3FeeCents,
      ...(dto.datevConsultantNumber === undefined
        ? {}
        : { datevConsultantNumber: dto.datevConsultantNumber.trim() || null }),
      ...(dto.datevClientNumber === undefined
        ? {}
        : { datevClientNumber: dto.datevClientNumber.trim() || null }),
      ...(dto.datevChart === undefined ? {} : { datevChart: dto.datevChart }),
      ...(dto.revenueAccount19 === undefined ? {} : { revenueAccount19: dto.revenueAccount19 }),
      ...(dto.revenueAccount7 === undefined ? {} : { revenueAccount7: dto.revenueAccount7 }),
      ...(dto.revenueAccount0 === undefined ? {} : { revenueAccount0: dto.revenueAccount0 }),
      ...(dto.revenueAccountReverseCharge === undefined
        ? {}
        : { revenueAccountReverseCharge: dto.revenueAccountReverseCharge }),
      ...(dto.debtorNumberStart === undefined
        ? {}
        : { debtorNumberStart: dto.debtorNumberStart }),
    };

    const profile = await this.prisma.tenantBillingProfile.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'invoicing.billing_profile.updated',
      entityType: 'tenant_billing_profile',
      entityId: profile.id,
      summary: 'Outgoing invoice billing profile updated',
    });
    return profile;
  }

  async listUninvoiced(from?: string, to?: string) {
    const start = from ? normalizeDay(from, 'from') : undefined;
    const endInclusive = to ? normalizeDay(to, 'to') : undefined;
    if (start && endInclusive && endInclusive < start) {
      throw new BadRequestException('to must be on or after from');
    }
    const endExclusive = endInclusive ? new Date(endInclusive) : undefined;
    if (endExclusive) endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    const assignments = await this.prisma.assignment.findMany({
      where: {
        status: 'completed',
        invoiceClaim: null,
        workDate: {
          gte: start,
          lt: endExclusive,
        },
      },
      select: {
        id: true,
        companyId: true,
        workDate: true,
        cargoName: true,
        routeName: true,
        pickupAddress: true,
        deliveryAddress: true,
        expectedDailyRevenue: true,
        company: {
          select: {
            id: true,
            name: true,
            invoiceEmail: true,
            defaultDailyRevenue: true,
            defaultTaxCategory: true,
          },
        },
      },
      orderBy: [{ company: { name: 'asc' } }, { workDate: 'asc' }],
    });

    const grouped = new Map<
      string,
      {
        companyId: string;
        companyName: string;
        invoiceEmail: string | null;
        assignmentCount: number;
        suggestedNetCents: number;
        assignmentsWithoutPrice: number;
        assignments: Array<{
          id: string;
          workDate: string;
          cargoName: string;
          routeName: string | null;
          pickupAddress: string;
          deliveryAddress: string;
          suggestedNetCents: number | null;
        }>;
      }
    >();

    for (const assignment of assignments) {
      const amount =
        decimalEuroToCents(assignment.expectedDailyRevenue) ??
        decimalEuroToCents(assignment.company.defaultDailyRevenue);
      const group = grouped.get(assignment.companyId) ?? {
        companyId: assignment.companyId,
        companyName: assignment.company.name,
        invoiceEmail: assignment.company.invoiceEmail,
        assignmentCount: 0,
        suggestedNetCents: 0,
        assignmentsWithoutPrice: 0,
        assignments: [],
      };
      group.assignmentCount += 1;
      group.suggestedNetCents += amount ?? 0;
      if (amount === null) group.assignmentsWithoutPrice += 1;
      group.assignments.push({
        id: assignment.id,
        workDate: assignment.workDate.toISOString(),
        cargoName: assignment.cargoName,
        routeName: assignment.routeName,
        pickupAddress: assignment.pickupAddress,
        deliveryAddress: assignment.deliveryAddress,
        suggestedNetCents: amount,
      });
      grouped.set(assignment.companyId, group);
    }

    return [...grouped.values()];
  }

  /**
   * Assignments whose work date has passed but that were never closed by the office.
   * They never reach the uninvoiced list, so without this view the revenue silently disappears.
   */
  async listOpenOverdue(asOf?: string) {
    const today = normalizeDay(asOf ?? new Date(), 'asOf');

    const assignments = await this.prisma.assignment.findMany({
      where: {
        status: { in: OPEN_ASSIGNMENT_STATUSES },
        workDate: { lt: today },
      },
      select: {
        id: true,
        companyId: true,
        status: true,
        workDate: true,
        cargoName: true,
        routeName: true,
        expectedDailyRevenue: true,
        driver: { select: { id: true, firstName: true, lastName: true } },
        company: {
          select: { id: true, name: true, defaultDailyRevenue: true },
        },
      },
      orderBy: [{ workDate: 'asc' }, { company: { name: 'asc' } }],
    });

    const grouped = new Map<
      string,
      {
        companyId: string;
        companyName: string;
        assignmentCount: number;
        potentialNetCents: number;
        oldestWorkDate: string;
        assignments: Array<{
          id: string;
          status: AssignmentStatus;
          workDate: string;
          cargoName: string;
          routeName: string | null;
          driverName: string | null;
          daysOverdue: number;
          suggestedNetCents: number | null;
        }>;
      }
    >();

    let totalAssignmentCount = 0;
    let totalPotentialNetCents = 0;

    for (const assignment of assignments) {
      const amount =
        decimalEuroToCents(assignment.expectedDailyRevenue) ??
        decimalEuroToCents(assignment.company.defaultDailyRevenue);
      const workDate = assignment.workDate.toISOString();
      const group = grouped.get(assignment.companyId) ?? {
        companyId: assignment.companyId,
        companyName: assignment.company.name,
        assignmentCount: 0,
        potentialNetCents: 0,
        oldestWorkDate: workDate,
        assignments: [],
      };
      group.assignmentCount += 1;
      group.potentialNetCents += amount ?? 0;
      group.assignments.push({
        id: assignment.id,
        status: assignment.status,
        workDate,
        cargoName: assignment.cargoName,
        routeName: assignment.routeName,
        driverName: assignment.driver
          ? `${assignment.driver.firstName} ${assignment.driver.lastName}`.trim()
          : null,
        daysOverdue: Math.round((today.getTime() - assignment.workDate.getTime()) / DAY_MS),
        suggestedNetCents: amount,
      });
      grouped.set(assignment.companyId, group);
      totalAssignmentCount += 1;
      totalPotentialNetCents += amount ?? 0;
    }

    const companies = [...grouped.values()].sort(
      (a, b) => b.potentialNetCents - a.potentialNetCents,
    );

    return {
      asOf: today.toISOString(),
      totals: {
        assignmentCount: totalAssignmentCount,
        potentialNetCents: totalPotentialNetCents,
        companyCount: companies.length,
      },
      companies,
    };
  }

  async createDraft(dto: CreateInvoiceDraftDto, actorUserId: string) {
    if (dto.assignmentIds.length === 0 && dto.manualLines.length === 0) {
      throw new BadRequestException('At least one assignment or manual line is required');
    }

    const servicePeriodStart = normalizeDay(dto.servicePeriodStart, 'servicePeriodStart');
    const servicePeriodEnd = normalizeDay(dto.servicePeriodEnd, 'servicePeriodEnd');
    if (servicePeriodEnd < servicePeriodStart) {
      throw new BadRequestException('servicePeriodEnd must be on or after servicePeriodStart');
    }
    const invoiceDate = normalizeDay(dto.invoiceDate ?? new Date(), 'invoiceDate');

    const [company, profile, assignments] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: dto.companyId },
        select: {
          id: true,
          name: true,
          defaultDailyRevenue: true,
          defaultTaxCategory: true,
          defaultPaymentTermDays: true,
        },
      }),
      this.prisma.tenantBillingProfile.findFirst(),
      dto.assignmentIds.length > 0
        ? this.prisma.assignment.findMany({
            where: { id: { in: dto.assignmentIds } },
            select: {
              id: true,
              companyId: true,
              status: true,
              workDate: true,
              cargoName: true,
              routeName: true,
              pickupAddress: true,
              deliveryAddress: true,
              expectedDailyRevenue: true,
              invoiceClaim: { select: { id: true } },
              company: { select: { defaultDailyRevenue: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    if (!company) throw new NotFoundException('Company not found');
    if (assignments.length !== dto.assignmentIds.length) {
      throw new NotFoundException('One or more assignments were not found');
    }
    for (const assignment of assignments) {
      if (assignment.companyId !== company.id) {
        throw new BadRequestException('All assignments must belong to the selected company');
      }
      if (assignment.status !== 'completed') {
        throw new BadRequestException('Only completed assignments can be invoiced');
      }
      if (assignment.invoiceClaim) {
        throw new ConflictException('An assignment has already been finalized on another invoice');
      }
    }

    const defaultTaxCategory = profile?.smallBusinessRule
      ? InvoiceTaxCategory.exempt
      : company.defaultTaxCategory;
    const defaultTaxRate = taxRateForCategory(
      defaultTaxCategory,
      profile?.defaultTaxRateBasisPoints ?? DEFAULT_TAX_RATE_BASIS_POINTS,
    );

    const assignmentLines = assignments.map((assignment, index) => {
      const unitPriceCents =
        decimalEuroToCents(assignment.expectedDailyRevenue) ??
        decimalEuroToCents(assignment.company.defaultDailyRevenue);
      if (unitPriceCents === null) {
        throw new BadRequestException(`Assignment ${assignment.id} has no invoice price`);
      }
      const calculated = calculateLine({
        quantityMilliunits: 1_000,
        unitPriceCents,
        taxRateBasisPoints: defaultTaxRate,
        taxCategory: defaultTaxCategory as InvoiceTaxCategoryValue,
      });
      return {
        position: index + 1,
        description: assignment.routeName
          ? `${assignment.cargoName} – ${assignment.routeName}`
          : `${assignment.cargoName} – ${assignment.pickupAddress} → ${assignment.deliveryAddress}`,
        quantity: new Prisma.Decimal('1'),
        unit: InvoiceUnit.tour,
        unitPriceCents,
        taxRateBasisPoints: defaultTaxRate,
        taxCategory: defaultTaxCategory,
        netCents: calculated.netCents,
        taxCents: calculated.taxCents,
        grossCents: calculated.grossCents,
        source: InvoiceLineSource.assignment,
        assignment: { connect: { id: assignment.id } },
        serviceDate: assignment.workDate,
        sourceSnapshot: {
          cargoName: assignment.cargoName,
          routeName: assignment.routeName,
          pickupAddress: assignment.pickupAddress,
          deliveryAddress: assignment.deliveryAddress,
          workDate: assignment.workDate.toISOString(),
        },
      } satisfies Prisma.InvoiceLineCreateWithoutInvoiceInput;
    });

    const manualLines = dto.manualLines.map((line, index) =>
      this.buildManualLine(line, assignmentLines.length + index + 1),
    );
    const allLines = [...assignmentLines, ...manualLines];
    const totals = calculateInvoiceTotals(
      allLines.map((line) => ({
        quantityMilliunits: parseQuantityToMilliunits(line.quantity.toString()),
        unitPriceCents: line.unitPriceCents,
        taxRateBasisPoints: line.taxRateBasisPoints,
        taxCategory: line.taxCategory as InvoiceTaxCategoryValue,
      })),
    );

    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          companyId: company.id,
          invoiceDate,
          servicePeriodStart,
          servicePeriodEnd,
          paymentTermDays:
            dto.paymentTermDays ??
            company.defaultPaymentTermDays ??
            profile?.defaultPaymentTermDays ??
            DEFAULT_PAYMENT_TERM_DAYS,
          notes: dto.notes?.trim() || null,
          netCents: totals.netCents,
          taxCents: totals.taxCents,
          grossCents: totals.grossCents,
          taxBreakdown: totals.taxBreakdown,
          createdById: actorUserId,
          lines: {
            create: allLines,
          },
        },
        include: { company: true, lines: { orderBy: { position: 'asc' } } },
      });
      await tx.invoiceAuditEvent.create({
        data: {
          invoiceId: created.id,
          actorUserId,
          action: 'draft.created',
          snapshot: {
            companyId: company.id,
            assignmentIds: dto.assignmentIds,
            netCents: totals.netCents,
            taxCents: totals.taxCents,
            grossCents: totals.grossCents,
          },
        },
      });
      return created;
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'invoice.draft_created',
      entityType: 'invoice',
      entityId: invoice.id,
      summary: 'Outgoing invoice draft created',
      metadata: { companyId: company.id, assignmentCount: assignments.length },
    });
    return invoice;
  }

  private buildManualLine(
    line: ManualInvoiceLineDto,
    position: number,
  ): Prisma.InvoiceLineCreateWithoutInvoiceInput {
    const quantityMilliunits = parseQuantityToMilliunits(line.quantity);
    assertTaxCombination(line.taxCategory, line.taxRateBasisPoints);
    const calculated = calculateLine({
      quantityMilliunits,
      unitPriceCents: line.unitPriceCents,
      taxRateBasisPoints: line.taxRateBasisPoints,
      taxCategory: line.taxCategory as InvoiceTaxCategoryValue,
    });
    return {
      position,
      description: line.description.trim(),
      quantity: new Prisma.Decimal(formatMilliunits(quantityMilliunits)),
      unit: line.unit,
      unitPriceCents: line.unitPriceCents,
      taxRateBasisPoints: line.taxRateBasisPoints,
      taxCategory: line.taxCategory,
      netCents: calculated.netCents,
      taxCents: calculated.taxCents,
      grossCents: calculated.grossCents,
      source: InvoiceLineSource.manual,
      serviceDate: line.serviceDate ? normalizeDay(line.serviceDate, 'serviceDate') : null,
    };
  }

  async listInvoices(filters: {
    status?: string;
    companyId?: string;
    from?: string;
    to?: string;
  }) {
    const status = filters.status
      ? this.parseStatus(filters.status)
      : undefined;
    const from = filters.from ? normalizeDay(filters.from, 'from') : undefined;
    const to = filters.to ? normalizeDay(filters.to, 'to') : undefined;
    if (from && to && to < from) throw new BadRequestException('to must be on or after from');
    const toExclusive = to ? new Date(to) : undefined;
    if (toExclusive) toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    return this.prisma.invoice.findMany({
      where: {
        status,
        companyId: filters.companyId,
        invoiceDate: { gte: from, lt: toExclusive },
      },
      select: {
        id: true,
        kind: true,
        status: true,
        number: true,
        invoiceDate: true,
        servicePeriodStart: true,
        servicePeriodEnd: true,
        dueDate: true,
        netCents: true,
        taxCents: true,
        grossCents: true,
        paidCents: true,
        createdAt: true,
        company: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async invoiceSummaryByCompany(filters: {
    from?: string;
    to?: string;
    groupBy?: string;
    status?: string;
  }) {
    const groupBy = filters.groupBy === 'day' ? 'day' : filters.groupBy === 'week' ? 'week' : null;
    if (!groupBy) {
      throw new BadRequestException('groupBy must be either day or week');
    }
    const status = filters.status ? this.parseStatus(filters.status) : undefined;

    const defaultTo = normalizeDay(new Date(), 'to');
    const defaultFrom = new Date(defaultTo.getTime() - (groupBy === 'day' ? 6 : 27) * DAY_MS);

    const from = filters.from ? normalizeDay(filters.from, 'from') : defaultFrom;
    const to = filters.to ? normalizeDay(filters.to, 'to') : defaultTo;
    if (to < from) {
      throw new BadRequestException('to must be on or after from');
    }

    const toExclusive = new Date(to.getTime() + DAY_MS);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        status,
        invoiceDate: { gte: from, lt: toExclusive },
      },
      select: {
        id: true,
        status: true,
        number: true,
        invoiceDate: true,
        netCents: true,
        taxCents: true,
        grossCents: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }],
    });

    const summaryByCompany = new Map<
      string,
      {
        companyId: string;
        companyName: string;
        invoiceCount: number;
        netCents: number;
        taxCents: number;
        grossCents: number;
        periods: Map<
          string,
          {
            periodKey: string;
            periodStart: string;
            periodEnd: string;
            invoiceCount: number;
            netCents: number;
            taxCents: number;
            grossCents: number;
          }
        >;
      }
    >();

    const totals = {
      invoiceCount: 0,
      netCents: 0,
      taxCents: 0,
      grossCents: 0,
    };

    for (const invoice of invoices) {
      totals.invoiceCount += 1;
      totals.netCents += invoice.netCents;
      totals.taxCents += invoice.taxCents;
      totals.grossCents += invoice.grossCents;

      const companyEntry =
        summaryByCompany.get(invoice.company.id) ??
        {
          companyId: invoice.company.id,
          companyName: invoice.company.name,
          invoiceCount: 0,
          netCents: 0,
          taxCents: 0,
          grossCents: 0,
          periods: new Map(),
        };

      companyEntry.invoiceCount += 1;
      companyEntry.netCents += invoice.netCents;
      companyEntry.taxCents += invoice.taxCents;
      companyEntry.grossCents += invoice.grossCents;

      const period = this.periodForDate(invoice.invoiceDate, groupBy);
      const periodEntry =
        companyEntry.periods.get(period.key) ??
        {
          periodKey: period.key,
          periodStart: period.start,
          periodEnd: period.end,
          invoiceCount: 0,
          netCents: 0,
          taxCents: 0,
          grossCents: 0,
        };
      periodEntry.invoiceCount += 1;
      periodEntry.netCents += invoice.netCents;
      periodEntry.taxCents += invoice.taxCents;
      periodEntry.grossCents += invoice.grossCents;
      companyEntry.periods.set(period.key, periodEntry);

      summaryByCompany.set(invoice.company.id, companyEntry);
    }

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      groupBy,
      status: status ?? null,
      totals,
      companies: [...summaryByCompany.values()]
        .map((entry) => ({
          companyId: entry.companyId,
          companyName: entry.companyName,
          invoiceCount: entry.invoiceCount,
          netCents: entry.netCents,
          taxCents: entry.taxCents,
          grossCents: entry.grossCents,
          periods: [...entry.periods.values()].sort((a, b) => a.periodKey.localeCompare(b.periodKey)),
        }))
        .sort((a, b) => b.grossCents - a.grossCents),
    };
  }

  async getInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        company: true,
        lines: { orderBy: { position: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' } },
        deliveryAttempts: { orderBy: { attemptedAt: 'desc' } },
        dunningNotices: { orderBy: { level: 'asc' } },
        auditEvents: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async recordPayment(
    invoiceId: string,
    tenantId: string,
    actorUserId: string,
    dto: CreateInvoicePaymentDto,
  ) {
    if (dto.amountCents <= 0) {
      throw new BadRequestException('amountCents must be greater than 0');
    }

    const paidAt = normalizeTimestamp(dto.paidAt, 'paidAt');
    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        select: {
          id: true,
          status: true,
          number: true,
          grossCents: true,
          paidCents: true,
          sentAt: true,
          finalizedAt: true,
        },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status === OutgoingInvoiceStatus.draft) {
        throw new ConflictException('Draft invoices cannot be paid');
      }
      if (invoice.status === OutgoingInvoiceStatus.cancelled) {
        throw new ConflictException('Cancelled invoices cannot be paid');
      }

      const nextPaidCents = invoice.paidCents + dto.amountCents;
      if (nextPaidCents > invoice.grossCents) {
        const openAmount = Math.max(invoice.grossCents - invoice.paidCents, 0);
        throw new BadRequestException(
          `Payment exceeds the open amount (${openAmount} cents remaining)`,
        );
      }

      const payment = await tx.invoicePayment.create({
        data: {
          invoiceId,
          amountCents: dto.amountCents,
          paidAt,
          method: dto.method,
          reference: dto.reference?.trim() || null,
          note: dto.note?.trim() || null,
          recordedById: actorUserId,
        },
      });

      const status = this.recalculatePaymentStatus(
        invoice.status,
        invoice.finalizedAt,
        invoice.sentAt,
        nextPaidCents,
        invoice.grossCents,
      );

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidCents: nextPaidCents,
          status,
          paidAt: status === OutgoingInvoiceStatus.paid ? paidAt : null,
        },
        include: {
          company: true,
          lines: { orderBy: { position: 'asc' } },
          payments: { orderBy: { paidAt: 'desc' } },
        },
      });

      await tx.invoiceAuditEvent.create({
        data: {
          invoiceId,
          actorUserId,
          action: 'payment.recorded',
          snapshot: {
            paymentId: payment.id,
            amountCents: payment.amountCents,
            paidAt: payment.paidAt.toISOString(),
            method: payment.method,
            reference: payment.reference,
            note: payment.note,
            statusBefore: invoice.status,
            statusAfter: updatedInvoice.status,
            paidCentsBefore: invoice.paidCents,
            paidCentsAfter: updatedInvoice.paidCents,
          },
        },
      });

      return { invoice: updatedInvoice, payment };
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'invoice.payment_recorded',
      entityType: 'invoice',
      entityId: invoiceId,
      summary: `Payment recorded for outgoing invoice ${result.invoice.number ?? invoiceId}`,
      metadata: {
        amount_cents: dto.amountCents,
        method: dto.method,
        paid_cents_after: result.invoice.paidCents,
        status_after: result.invoice.status,
      },
    });

    return result;
  }

  async deletePayment(paymentId: string, tenantId: string, actorUserId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.invoicePayment.findFirst({
        where: { id: paymentId, tenantId },
        include: {
          invoice: {
            select: {
              id: true,
              status: true,
              number: true,
              grossCents: true,
              paidCents: true,
              sentAt: true,
              finalizedAt: true,
            },
          },
        },
      });
      if (!payment) throw new NotFoundException('Payment not found');

      const nextPaidCents = Math.max(payment.invoice.paidCents - payment.amountCents, 0);
      const status = this.recalculatePaymentStatus(
        payment.invoice.status,
        payment.invoice.finalizedAt,
        payment.invoice.sentAt,
        nextPaidCents,
        payment.invoice.grossCents,
      );

      await tx.invoicePayment.delete({ where: { id: paymentId } });

      const updatedInvoice = await tx.invoice.update({
        where: { id: payment.invoice.id },
        data: {
          paidCents: nextPaidCents,
          status,
          paidAt: status === OutgoingInvoiceStatus.paid ? payment.paidAt : null,
        },
        include: {
          company: true,
          lines: { orderBy: { position: 'asc' } },
          payments: { orderBy: { paidAt: 'desc' } },
        },
      });

      await tx.invoiceAuditEvent.create({
        data: {
          invoiceId: payment.invoice.id,
          actorUserId,
          action: 'payment.deleted',
          snapshot: {
            paymentId,
            amountCents: payment.amountCents,
            paidAt: payment.paidAt.toISOString(),
            method: payment.method,
            reference: payment.reference,
            note: payment.note,
            statusBefore: payment.invoice.status,
            statusAfter: updatedInvoice.status,
            paidCentsBefore: payment.invoice.paidCents,
            paidCentsAfter: updatedInvoice.paidCents,
          },
        },
      });

      return { invoice: updatedInvoice, deletedPaymentId: paymentId };
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'invoice.payment_deleted',
      entityType: 'invoice',
      entityId: result.invoice.id,
      summary: `Payment deleted from outgoing invoice ${result.invoice.number ?? result.invoice.id}`,
      metadata: {
        payment_id: paymentId,
        paid_cents_after: result.invoice.paidCents,
        status_after: result.invoice.status,
      },
    });

    return result;
  }

  private recalculatePaymentStatus(
    currentStatus: OutgoingInvoiceStatus,
    finalizedAt: Date | null,
    sentAt: Date | null,
    paidCents: number,
    grossCents: number,
  ): OutgoingInvoiceStatus {
    if (paidCents >= grossCents && grossCents > 0) return OutgoingInvoiceStatus.paid;
    if (paidCents > 0) return OutgoingInvoiceStatus.partially_paid;
    if (
      currentStatus !== OutgoingInvoiceStatus.paid &&
      currentStatus !== OutgoingInvoiceStatus.partially_paid
    ) {
      return currentStatus;
    }
    if (sentAt) return OutgoingInvoiceStatus.sent;
    if (finalizedAt) return OutgoingInvoiceStatus.finalized;
    return currentStatus;
  }

  async updateDraft(id: string, dto: UpdateInvoiceDraftDto, actorUserId: string) {
    const existing = await this.prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        servicePeriodStart: true,
        servicePeriodEnd: true,
      },
    });
    if (!existing) throw new NotFoundException('Invoice not found');
    if (existing.status !== OutgoingInvoiceStatus.draft) {
      throw new ConflictException('Only draft invoices can be changed');
    }

    const servicePeriodStart = dto.servicePeriodStart
      ? normalizeDay(dto.servicePeriodStart, 'servicePeriodStart')
      : existing.servicePeriodStart;
    const servicePeriodEnd = dto.servicePeriodEnd
      ? normalizeDay(dto.servicePeriodEnd, 'servicePeriodEnd')
      : existing.servicePeriodEnd;
    if (servicePeriodEnd < servicePeriodStart) {
      throw new BadRequestException('servicePeriodEnd must be on or after servicePeriodStart');
    }

    const data: Prisma.InvoiceUpdateInput = {
      servicePeriodStart,
      servicePeriodEnd,
    };
    if (dto.invoiceDate !== undefined) {
      data.invoiceDate = normalizeDay(dto.invoiceDate, 'invoiceDate');
    }
    if (dto.paymentTermDays !== undefined) data.paymentTermDays = dto.paymentTermDays;
    if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;

    const invoice = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data,
        include: { company: true, lines: { orderBy: { position: 'asc' } } },
      });
      await tx.invoiceAuditEvent.create({
        data: {
          invoiceId: id,
          actorUserId,
          action: 'draft.updated',
          snapshot: {
            invoiceDate: updated.invoiceDate.toISOString(),
            servicePeriodStart: updated.servicePeriodStart.toISOString(),
            servicePeriodEnd: updated.servicePeriodEnd.toISOString(),
            paymentTermDays: updated.paymentTermDays,
          },
        },
      });
      return updated;
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'invoice.draft_updated',
      entityType: 'invoice',
      entityId: invoice.id,
      summary: 'Outgoing invoice draft updated',
    });
    return invoice;
  }

  async addDraftLine(invoiceId: string, dto: ManualInvoiceLineDto, actorUserId: string) {
    const existing = await this.loadDraftForLineChange(invoiceId);
    const line = asBadRequest(() => this.buildManualLine(dto, existing.lines.length + 1));

    return this.applyDraftLineChange(
      invoiceId,
      actorUserId,
      'draft.line_added',
      'Outgoing invoice draft line added',
      async (tx) => {
        await tx.invoiceLine.create({
          data: { ...line, invoice: { connect: { id: invoiceId } } },
        });
      },
    );
  }

  async updateDraftLine(
    invoiceId: string,
    lineId: string,
    dto: UpdateInvoiceLineDto,
    actorUserId: string,
  ) {
    const existing = await this.loadDraftForLineChange(invoiceId);
    const current = existing.lines.find((line) => line.id === lineId);
    if (!current) throw new NotFoundException('Invoice line not found');

    const quantityMilliunits = asBadRequest(() =>
      parseQuantityToMilliunits(dto.quantity ?? current.quantity.toString()),
    );
    const taxCategory = dto.taxCategory ?? current.taxCategory;
    const taxRateBasisPoints = dto.taxRateBasisPoints ?? current.taxRateBasisPoints;
    const unitPriceCents = dto.unitPriceCents ?? current.unitPriceCents;
    const calculated = asBadRequest(() => {
      assertTaxCombination(taxCategory, taxRateBasisPoints);
      return calculateLine({
        quantityMilliunits,
        unitPriceCents,
        taxRateBasisPoints,
        taxCategory: taxCategory as InvoiceTaxCategoryValue,
      });
    });

    const description = dto.description?.trim() ?? current.description;
    if (!description) throw new BadRequestException('description must not be empty');

    return this.applyDraftLineChange(
      invoiceId,
      actorUserId,
      'draft.line_updated',
      'Outgoing invoice draft line updated',
      async (tx) => {
        await tx.invoiceLine.update({
          where: { id: lineId },
          data: {
            description,
            quantity: new Prisma.Decimal(formatMilliunits(quantityMilliunits)),
            unit: dto.unit ?? current.unit,
            unitPriceCents,
            taxRateBasisPoints,
            taxCategory,
            netCents: calculated.netCents,
            taxCents: calculated.taxCents,
            grossCents: calculated.grossCents,
            serviceDate:
              dto.serviceDate === undefined
                ? current.serviceDate
                : normalizeDay(dto.serviceDate, 'serviceDate'),
          },
        });
      },
    );
  }

  async deleteDraftLine(invoiceId: string, lineId: string, actorUserId: string) {
    const existing = await this.loadDraftForLineChange(invoiceId);
    if (!existing.lines.some((line) => line.id === lineId)) {
      throw new NotFoundException('Invoice line not found');
    }
    if (existing.lines.length === 1) {
      throw new BadRequestException('An invoice must keep at least one line');
    }

    return this.applyDraftLineChange(
      invoiceId,
      actorUserId,
      'draft.line_removed',
      'Outgoing invoice draft line removed',
      async (tx) => {
        await tx.invoiceLine.delete({ where: { id: lineId } });
      },
    );
  }

  private async loadDraftForLineChange(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        status: true,
        lines: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            description: true,
            quantity: true,
            unit: true,
            unitPriceCents: true,
            taxRateBasisPoints: true,
            taxCategory: true,
            serviceDate: true,
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== OutgoingInvoiceStatus.draft) {
      throw new ConflictException('Only draft invoices can be changed');
    }
    return invoice;
  }

  /**
   * Line writes must never leave the stored totals behind: the mutation, the position
   * renumbering and the recalculated totals belong to one transaction.
   */
  private async applyDraftLineChange(
    invoiceId: string,
    actorUserId: string,
    auditAction: string,
    auditSummary: string,
    mutate: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const invoice = await this.prisma.$transaction(async (tx) => {
      await mutate(tx);

      const lines = await tx.invoiceLine.findMany({
        where: { invoiceId },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          quantity: true,
          unitPriceCents: true,
          taxRateBasisPoints: true,
          taxCategory: true,
        },
      });
      if (lines.length === 0) {
        throw new BadRequestException('An invoice must keep at least one line');
      }

      for (const [index, line] of lines.entries()) {
        await tx.invoiceLine.update({
          where: { id: line.id },
          data: { position: index + 1 },
        });
      }

      const totals = calculateInvoiceTotals(
        lines.map((line) => ({
          quantityMilliunits: parseQuantityToMilliunits(line.quantity.toString()),
          unitPriceCents: line.unitPriceCents,
          taxRateBasisPoints: line.taxRateBasisPoints,
          taxCategory: line.taxCategory as InvoiceTaxCategoryValue,
        })),
      );

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          netCents: totals.netCents,
          taxCents: totals.taxCents,
          grossCents: totals.grossCents,
          taxBreakdown: totals.taxBreakdown,
        },
        include: { company: true, lines: { orderBy: { position: 'asc' } } },
      });

      await tx.invoiceAuditEvent.create({
        data: {
          invoiceId,
          actorUserId,
          action: auditAction,
          snapshot: {
            lineCount: lines.length,
            netCents: totals.netCents,
            taxCents: totals.taxCents,
            grossCents: totals.grossCents,
          },
        },
      });

      return updated;
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'invoice.draft_line_changed',
      entityType: 'invoice',
      entityId: invoiceId,
      summary: auditSummary,
    });
    return invoice;
  }

  /**
   * Turns a draft into a legally binding invoice. Everything happens inside one
   * transaction: a rollback must also roll back the consumed invoice number, and the
   * customer/supplier data is snapshotted because GoBD forbids a finalized invoice from
   * changing when the underlying master data is edited later.
   */
  async finalizeInvoice(id: string, tenantId: string, actorUserId: string) {
    // One timestamp for the whole operation: it stamps the invoice and the rendered
    // documents alike, so the PDF metadata and finalizedAt can never disagree.
    const renderedAt = new Date();

    const invoice = await this.prisma.$transaction(async (tx) => {
      // Serializes concurrent finalize attempts on the same invoice; the status check
      // below is only meaningful while this row lock is held.
      const locked = await tx.$queryRaw<Array<{ id: string; status: OutgoingInvoiceStatus }>>(
        Prisma.sql`
          SELECT "id", "status"
          FROM "Invoice"
          WHERE "id" = ${id} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `,
      );
      if (locked.length === 0) throw new NotFoundException('Invoice not found');
      if (locked[0].status !== OutgoingInvoiceStatus.draft) {
        throw new ConflictException('Invoice has already been finalized');
      }

      const existing = await tx.invoice.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Invoice not found');

      const [lines, profile, company] = await Promise.all([
        tx.invoiceLine.findMany({
          where: { invoiceId: id },
          orderBy: { position: 'asc' },
        }),
        tx.tenantBillingProfile.findUnique({ where: { tenantId } }),
        tx.company.findUnique({ where: { id: existing.companyId } }),
      ]);

      if (lines.length === 0) {
        throw new BadRequestException('An invoice needs at least one line before it can be finalized');
      }
      if (!profile) {
        throw new BadRequestException('A billing profile is required before finalizing');
      }
      if (!company) throw new NotFoundException('Company not found');
      // Fail before a number is spent. These are the conformance rules the official
      // validators enforce; shipping a document that fails them would be worse than
      // refusing, because finalized documents are never re-rendered.
      if (requiresUbl(company.eInvoicePreference)) {
        if (!company.leitwegId?.trim()) {
          throw new BadRequestException(
            'A Leitweg-ID is required on the customer before an XRechnung invoice can be finalized',
          );
        }
        if (!profile.phone?.trim()) {
          throw new BadRequestException(
            'XRechnung (BR-DE-6) requires a seller telephone number (BT-42) in the billing profile before the invoice can be issued',
          );
        }
      }
      if (!profile.vatId?.trim() && !profile.registrationNumber?.trim()) {
        throw new BadRequestException(
          'EN 16931 (BR-CO-26) requires a seller VAT ID or a legal registration number (Handelsregisternummer) in the billing profile; a tax number alone is not enough',
        );
      }

      // §19 UStG: a small business never charges VAT, no matter what the draft lines say.
      const recalculated = lines.map((line) => {
        const forceExempt = profile.smallBusinessRule && line.taxRateBasisPoints !== 0;
        const taxCategory = forceExempt ? InvoiceTaxCategory.exempt : line.taxCategory;
        const taxRateBasisPoints = forceExempt ? 0 : line.taxRateBasisPoints;
        const input = {
          quantityMilliunits: parseQuantityToMilliunits(line.quantity.toString()),
          unitPriceCents: line.unitPriceCents,
          taxRateBasisPoints,
          taxCategory: taxCategory as InvoiceTaxCategoryValue,
        };
        return { line, taxCategory, input, calculated: calculateLine(input) };
      });

      // The client never gets to dictate the amounts that end up on a finalized invoice.
      const totals = calculateInvoiceTotals(recalculated.map((entry) => entry.input));

      for (const entry of recalculated) {
        const unchanged =
          entry.line.taxRateBasisPoints === entry.input.taxRateBasisPoints &&
          entry.line.taxCategory === entry.taxCategory &&
          entry.line.netCents === entry.calculated.netCents &&
          entry.line.taxCents === entry.calculated.taxCents &&
          entry.line.grossCents === entry.calculated.grossCents;
        if (unchanged) continue;
        await tx.invoiceLine.update({
          where: { id: entry.line.id },
          data: {
            taxRateBasisPoints: entry.input.taxRateBasisPoints,
            taxCategory: entry.taxCategory,
            netCents: entry.calculated.netCents,
            taxCents: entry.calculated.taxCents,
            grossCents: entry.calculated.grossCents,
          },
        });
      }

      const allocated = await allocateInvoiceNumber(
        tx,
        tenantId,
        existing.invoiceDate,
        profile.invoiceNumberFormat,
      );

      const dueDate = new Date(existing.invoiceDate);
      dueDate.setUTCDate(dueDate.getUTCDate() + existing.paymentTermDays);

      const supplierSnapshot: Prisma.InputJsonObject = {
        legalName: profile.legalName,
        street: profile.street,
        postalCode: profile.postalCode,
        city: profile.city,
        countryCode: profile.countryCode,
        taxNumber: profile.taxNumber,
        vatId: profile.vatId,
        registrationNumber: profile.registrationNumber,
        phone: profile.phone,
        iban: profile.iban,
        bic: profile.bic,
        bankName: profile.bankName,
        invoiceNumberFormat: profile.invoiceNumberFormat,
        defaultPaymentTermDays: profile.defaultPaymentTermDays,
        defaultTaxRateBasisPoints: profile.defaultTaxRateBasisPoints,
        smallBusinessRule: profile.smallBusinessRule,
        invoiceFooterText: profile.invoiceFooterText,
      };

      const customerSnapshot = {
        customerName: company.billingName?.trim() || company.name,
        customerStreet: company.billingStreet,
        customerPostalCode: company.billingPostalCode,
        customerCity: company.billingCity,
        customerCountryCode: company.billingCountryCode,
        customerVatId: company.vatId,
        customerEmail: company.invoiceEmail,
        leitwegId: company.leitwegId,
      };
      const notes = profile.smallBusinessRule
        ? appendNote(existing.notes, SMALL_BUSINESS_NOTE)
        : existing.notes;

      // Render-once, store-forever: the legal documents are produced here, inside the
      // same transaction that assigns the number, so an invoice can never reach
      // "finalized" without them. Nothing ever re-renders them afterwards.
      const documents = await this.renderAndStoreDocuments({
        preference: company.eInvoicePreference,
        renderedAt,
        invoice: {
          ...customerSnapshot,
          number: allocated.number,
          invoiceDate: existing.invoiceDate,
          dueDate,
          servicePeriodStart: existing.servicePeriodStart,
          servicePeriodEnd: existing.servicePeriodEnd,
          paymentTermDays: existing.paymentTermDays,
          currency: existing.currency,
          netCents: totals.netCents,
          taxCents: totals.taxCents,
          grossCents: totals.grossCents,
          notes,
        },
        supplier: {
          legalName: profile.legalName,
          street: profile.street,
          postalCode: profile.postalCode,
          city: profile.city,
          countryCode: profile.countryCode,
          taxNumber: profile.taxNumber,
          vatId: profile.vatId,
          registrationNumber: profile.registrationNumber,
          phone: profile.phone,
          iban: profile.iban,
          bic: profile.bic,
          bankName: profile.bankName,
          smallBusinessRule: profile.smallBusinessRule,
          invoiceFooterText: profile.invoiceFooterText,
          invoiceEmailCc: profile.invoiceEmailCc,
        },
        lines: recalculated.map((entry) => ({
          position: entry.line.position,
          description: entry.line.description,
          quantityMilliunits: entry.input.quantityMilliunits,
          unit: entry.line.unit,
          unitPriceCents: entry.input.unitPriceCents,
          taxRateBasisPoints: entry.input.taxRateBasisPoints,
          taxCategory: entry.taxCategory,
          netCents: entry.calculated.netCents,
          serviceDate: entry.line.serviceDate,
        })),
        taxBreakdown: totals.taxBreakdown,
      });

      const updated = await tx.invoice.update({
        where: { id },
        data: {
          status: OutgoingInvoiceStatus.finalized,
          number: allocated.number,
          dueDate,
          netCents: totals.netCents,
          taxCents: totals.taxCents,
          grossCents: totals.grossCents,
          taxBreakdown: totals.taxBreakdown,
          ...customerSnapshot,
          supplierSnapshot,
          notes,
          pdfStoredPath: documents.pdfStoredPath,
          pdfSha256: documents.pdfSha256,
          zugferdXmlStoredPath: documents.zugferdXmlStoredPath,
          zugferdXmlSha256: documents.zugferdXmlSha256,
          xrechnungStoredPath: documents.xrechnungStoredPath,
          xrechnungSha256: documents.xrechnungSha256,
          finalizedAt: renderedAt,
          finalizedById: actorUserId,
        },
        include: { company: true, lines: { orderBy: { position: 'asc' } } },
      });

      // Claiming the assignments here is what makes createDraft reject a second invoice
      // for work that has already been billed.
      for (const entry of recalculated) {
        if (entry.line.source !== InvoiceLineSource.assignment || !entry.line.assignmentId) {
          continue;
        }
        try {
          await tx.invoiceAssignmentClaim.create({
            data: { assignmentId: entry.line.assignmentId, invoiceLineId: entry.line.id },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            throw new ConflictException(
              'An assignment on this invoice has already been finalized on another invoice',
            );
          }
          throw error;
        }
      }

      await tx.invoiceAuditEvent.create({
        data: {
          invoiceId: id,
          actorUserId,
          action: 'finalized',
          snapshot: {
            before: {
              status: existing.status,
              number: existing.number,
              netCents: existing.netCents,
              taxCents: existing.taxCents,
              grossCents: existing.grossCents,
              dueDate: existing.dueDate?.toISOString() ?? null,
            },
            after: {
              status: updated.status,
              number: updated.number,
              sequenceValue: allocated.sequenceValue,
              sequenceYear: allocated.year,
              netCents: updated.netCents,
              taxCents: updated.taxCents,
              grossCents: updated.grossCents,
              dueDate: dueDate.toISOString(),
              customerName: updated.customerName,
              pdfSha256: documents.pdfSha256,
              zugferdXmlSha256: documents.zugferdXmlSha256,
              xrechnungSha256: documents.xrechnungSha256,
            },
          },
        },
      });

      return updated;
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'invoice.finalized',
      entityType: 'invoice',
      entityId: invoice.id,
      summary: `Outgoing invoice ${invoice.number} finalized`,
      metadata: { companyId: invoice.companyId, grossCents: invoice.grossCents },
    });
    return invoice;
  }

  /**
   * Builds the legal documents for a freshly finalized invoice and writes them to
   * immutable storage. Called exactly once per invoice, from inside the finalize
   * transaction — if the transaction rolls back the files are simply orphaned, which is
   * far safer than a finalized invoice whose documents were never written.
   */
  private async renderAndStoreDocuments(params: {
    preference: EInvoicePreference;
    renderedAt: Date;
    invoice: FinalizedInvoiceSnapshot;
    supplier: SupplierSnapshot;
    lines: FinalizedLineSnapshot[];
    taxBreakdown: EInvoiceTaxGroup[];
  }): Promise<{
    pdfStoredPath: string;
    pdfSha256: string;
    zugferdXmlStoredPath: string | null;
    zugferdXmlSha256: string | null;
    xrechnungStoredPath: string | null;
    xrechnungSha256: string | null;
  }> {
    const invoiceNumber = params.invoice.number ?? '';
    let rendered;
    try {
      rendered = await renderInvoiceDocuments({
        document: buildEInvoiceDocument({
          invoice: params.invoice,
          supplier: params.supplier,
          lines: params.lines,
          taxBreakdown: params.taxBreakdown,
        }),
        preference: params.preference,
        renderedAt: params.renderedAt,
      });
    } catch (error) {
      if (error instanceof EInvoiceValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const pdf = await this.invoiceDocuments.save(
      this.invoiceDocuments.buildFileName(invoiceNumber, 'rechnung'),
      rendered.pdf,
    );
    const zugferd = rendered.ciiXml
      ? await this.invoiceDocuments.save(
          this.invoiceDocuments.buildFileName(invoiceNumber, 'zugferd'),
          rendered.ciiXml,
        )
      : null;
    const xrechnung = rendered.ublXml
      ? await this.invoiceDocuments.save(
          this.invoiceDocuments.buildFileName(invoiceNumber, 'xrechnung'),
          rendered.ublXml,
        )
      : null;

    return {
      pdfStoredPath: pdf.storedPath,
      pdfSha256: pdf.sha256,
      zugferdXmlStoredPath: zugferd?.storedPath ?? null,
      zugferdXmlSha256: zugferd?.sha256 ?? null,
      xrechnungStoredPath: xrechnung?.storedPath ?? null,
      xrechnungSha256: xrechnung?.sha256 ?? null,
    };
  }

  /**
   * E-mails a finalized invoice to the customer, PDF (and where it is the legally original
   * document, the XML) attached. Every attempt — successful or not — is written to
   * InvoiceDeliveryAttempt, and a failure never changes the invoice itself, so a bounced
   * mail leaves a retryable record instead of a half-sent invoice.
   */
  async sendInvoice(
    id: string,
    tenantId: string,
    actorUserId: string,
    dto: SendInvoiceDto = {},
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        company: { select: { name: true, invoiceEmail: true, eInvoicePreference: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === OutgoingInvoiceStatus.draft) {
      throw new ConflictException('The invoice must be finalized before it can be sent');
    }

    // The snapshot address wins: it is the address the invoice was issued to, and it must
    // not silently move when the company master data is edited afterwards.
    const recipientEmail =
      invoice.customerEmail?.trim() || invoice.company.invoiceEmail?.trim() || null;
    if (!recipientEmail) {
      throw new BadRequestException(
        'The customer has no invoice e-mail address; add one to the company or the invoice before sending',
      );
    }

    const profile = await this.prisma.tenantBillingProfile.findUnique({ where: { tenantId } });
    const ccEmail = profile?.invoiceEmailCc?.trim() || null;

    const sellerName = readSnapshotString(invoice.supplierSnapshot, 'legalName') ?? profile?.legalName;
    const iban = readSnapshotString(invoice.supplierSnapshot, 'iban') ?? profile?.iban;
    if (!sellerName || !iban) {
      throw new BadRequestException('A billing profile is required before an invoice can be sent');
    }

    // ZUGFeRD carries the CII inside the PDF, so only XRechnung needs a separate XML file.
    const includeXml = dto.includeXml ?? requiresUbl(invoice.company.eInvoicePreference);
    const xmlStoredPath = includeXml
      ? invoice.xrechnungStoredPath ?? invoice.zugferdXmlStoredPath
      : null;

    const template = invoiceDeliveryMail({
      invoiceNumber: invoice.number ?? id,
      sellerName,
      customerName: invoice.customerName ?? invoice.company.name,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      servicePeriodStart: invoice.servicePeriodStart,
      servicePeriodEnd: invoice.servicePeriodEnd,
      grossCents: invoice.grossCents,
      currency: invoice.currency,
      iban,
      bic: readSnapshotString(invoice.supplierSnapshot, 'bic') ?? profile?.bic ?? null,
      bankName: readSnapshotString(invoice.supplierSnapshot, 'bankName') ?? profile?.bankName ?? null,
      includesXml: xmlStoredPath !== null,
      footerText:
        readSnapshotString(invoice.supplierSnapshot, 'invoiceFooterText') ??
        profile?.invoiceFooterText ??
        null,
      language: dto.language ?? 'de',
    });

    const mailMode = this.mailService.isEnabled() ? 'smtp' : 'log';
    const attachmentBaseName = invoice.number ?? id;
    let result: SendMailResult;
    try {
      const attachments: MailAttachment[] = [
        {
          filename: `${attachmentBaseName}.pdf`,
          content: await this.readStoredDocument(invoice.pdfStoredPath),
          contentType: 'application/pdf',
        },
      ];
      if (xmlStoredPath) {
        attachments.push({
          filename: `${attachmentBaseName}.xml`,
          content: await this.readStoredDocument(xmlStoredPath),
          contentType: 'application/xml',
        });
      }
      result = await this.mailService.sendMail({
        to: recipientEmail,
        cc: ccEmail,
        subject: template.subject,
        text: template.text,
        html: template.html,
        attachments,
      });
    } catch (error) {
      const errorMessage = (error instanceof Error ? error.message : 'Unknown mail error').slice(
        0,
        1_000,
      );
      await this.recordDeliveryAttempt({
        invoiceId: id,
        actorUserId,
        recipientEmail,
        ccEmail,
        mailMode,
        status: 'failed',
        errorMessage,
      });
      await safeAuditLog(this.auditService, {
        actorUserId,
        action: 'invoice.send_failed',
        entityType: 'invoice',
        entityId: id,
        summary: `Sending outgoing invoice ${invoice.number ?? id} failed`,
        metadata: { mail_mode: mailMode, recipient_domain: emailDomain(recipientEmail) },
      });
      throw new ServiceUnavailableException(
        `The invoice could not be e-mailed and remains unsent; the failed attempt was recorded and can be retried (${errorMessage})`,
      );
    }

    const attemptedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.invoiceDeliveryAttempt.create({
        data: {
          invoiceId: id,
          recipientEmail,
          ccEmail,
          status: 'sent',
          mailMode: result.mode,
          providerMessageId: result.messageId ?? null,
          attemptedAt,
        },
      });

      // A successful dispatch marks the invoice sent unless the invoice is already paid.
      const status =
        invoice.status === OutgoingInvoiceStatus.paid
          ? OutgoingInvoiceStatus.paid
          : OutgoingInvoiceStatus.sent;
      const row = await tx.invoice.update({
        where: { id },
        data: {
          status,
          // The first successful delivery is the legally relevant one; later copies are
          // documented by their delivery attempts.
          sentAt: invoice.sentAt ?? attemptedAt,
        },
        include: { company: true, lines: { orderBy: { position: 'asc' } } },
      });

      await tx.invoiceAuditEvent.create({
        data: {
          invoiceId: id,
          actorUserId,
          action: 'sent',
          snapshot: {
            recipientEmail,
            ccEmail,
            mailMode: result.mode,
            mailSent: result.sent,
            providerMessageId: result.messageId ?? null,
            attachments: [
              `${attachmentBaseName}.pdf`,
              ...(xmlStoredPath ? [`${attachmentBaseName}.xml`] : []),
            ],
            statusBefore: invoice.status,
            statusAfter: row.status,
            sentAt: row.sentAt?.toISOString() ?? null,
          },
        },
      });

      return row;
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'invoice.sent',
      entityType: 'invoice',
      entityId: id,
      summary: `Outgoing invoice ${invoice.number ?? id} sent`,
      metadata: {
        mail_mode: result.mode,
        mail_sent: result.sent,
        recipient_domain: emailDomain(recipientEmail),
      },
    });

    return {
      invoice: updated,
      recipientEmail,
      ccEmail,
      mailSent: result.sent,
      mailMode: result.mode,
      attachedXml: xmlStoredPath !== null,
    };
  }

  async exportDatev(from: string, to: string, tenantId: string, actorUserId: string) {
    const periodStart = normalizeDay(from, 'from');
    const periodEnd = normalizeDay(to, 'to');
    if (periodEnd < periodStart) {
      throw new BadRequestException('to must be on or after from');
    }

    const periodEndExclusive = new Date(periodEnd);
    periodEndExclusive.setUTCDate(periodEndExclusive.getUTCDate() + 1);

    const result = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.tenantBillingProfile.findUnique({ where: { tenantId } });
      if (!profile) {
        throw new BadRequestException('A billing profile is required before DATEV export');
      }

      const invoices = await tx.invoice.findMany({
        where: {
          tenantId,
          invoiceDate: { gte: periodStart, lt: periodEndExclusive },
          status: { not: OutgoingInvoiceStatus.draft },
          number: { not: null },
        },
        select: {
          id: true,
          number: true,
          kind: true,
          status: true,
          invoiceDate: true,
          taxBreakdown: true,
          grossCents: true,
          company: {
            select: {
              id: true,
              name: true,
              datevDebtorNumber: true,
            },
          },
        },
        orderBy: [{ invoiceDate: 'asc' }, { number: 'asc' }],
      });

      const exportable = invoices.filter((invoice) => isExportableInvoiceStatus(invoice.status));
      const companyIds = [...new Set(exportable.map((invoice) => invoice.company.id))];
      const debtorNumbers = await this.ensureDatevDebtorNumbers(
        tx,
        tenantId,
        companyIds,
        profile.debtorNumberStart,
      );

      const invoiceIds = exportable.map((invoice) => invoice.id);
      const previousExports = await tx.datevExport.findMany({
        where: { tenantId },
        select: { id: true, invoiceIds: true },
      });

      const previouslyExportedInvoiceIds = new Set<string>();
      for (const exported of previousExports) {
        if (!Array.isArray(exported.invoiceIds)) continue;
        for (const entry of exported.invoiceIds) {
          if (typeof entry === 'string') previouslyExportedInvoiceIds.add(entry);
        }
      }

      const repeatedInvoiceNumbers = exportable
        .filter((invoice) => previouslyExportedInvoiceIds.has(invoice.id))
        .map((invoice) => invoice.number)
        .filter((number): number is string => typeof number === 'string');

      const datevInvoices: DatevInvoiceExportInput[] = exportable.map((invoice) => {
        const taxBuckets = readDatevTaxBuckets(invoice.taxBreakdown);
        const normalizedBuckets = taxBuckets.length
          ? taxBuckets
          : [
              {
                taxCategory: 'exempt' as const,
                taxRateBasisPoints: 0,
                grossCents: invoice.grossCents,
              },
            ];

        return {
          invoiceId: invoice.id,
          invoiceNumber: invoice.number ?? invoice.id,
          invoiceDate: invoice.invoiceDate,
          companyName: invoice.company.name,
          debtorNumber: debtorNumbers.get(invoice.company.id) ?? profile.debtorNumberStart,
          kind:
            invoice.kind === InvoiceKind.invoice
              ? 'invoice'
              : invoice.kind === InvoiceKind.credit_note
                ? 'credit_note'
                : 'cancellation',
          taxBuckets: normalizedBuckets,
        };
      });

      const buchungsstapelCsv = renderExtfBuchungsstapelCsv({
        profile: {
          consultantNumber: profile.datevConsultantNumber,
          clientNumber: profile.datevClientNumber,
          chart: profile.datevChart === 'SKR04' ? 'SKR04' : 'SKR03',
          revenueAccount19: profile.revenueAccount19,
          revenueAccount7: profile.revenueAccount7,
          revenueAccount0: profile.revenueAccount0,
          revenueAccountReverseCharge: profile.revenueAccountReverseCharge,
        },
        createdAt: new Date(),
        invoices: datevInvoices,
      });

      const debtorCsv = renderDebtorMasterCsv(
        [...debtorNumbers.entries()]
          .map(([companyId, debtorNumber]) => {
            const companyName = exportable.find((invoice) => invoice.company.id === companyId)?.company.name;
            return {
              debtorNumber,
              companyName: companyName ?? companyId,
            };
          })
          .sort((left, right) => left.debtorNumber - right.debtorNumber),
      );

      const payload = this.buildDatevExportPayload(buchungsstapelCsv, debtorCsv);
      const fileName = this.datevExportStorage.buildFileName(periodStart, periodEnd);
      const stored = await this.datevExportStorage.save(fileName, payload);

      const exportRow = await tx.datevExport.create({
        data: {
          tenantId,
          periodStart,
          periodEnd,
          createdById: actorUserId,
          fileStoredPath: stored.storedPath,
          fileSha256: stored.sha256,
          invoiceIds,
        },
      });

      if (exportable.length > 0) {
        await tx.invoiceAuditEvent.createMany({
          data: exportable.map((invoice) => ({
            tenantId,
            invoiceId: invoice.id,
            actorUserId,
            action: 'datev.exported',
            snapshot: {
              exportId: exportRow.id,
              periodStart: periodStart.toISOString().slice(0, 10),
              periodEnd: periodEnd.toISOString().slice(0, 10),
            },
          })),
        });
      }

      return {
        exportId: exportRow.id,
        fileStoredPath: exportRow.fileStoredPath,
        invoiceCount: exportable.length,
        repeatedInvoiceNumbers,
      };
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'datev.export_generated',
      entityType: 'datev_export',
      entityId: result.exportId,
      summary: 'DATEV EXTF export generated',
      metadata: {
        invoice_count: result.invoiceCount,
        repeated_invoice_count: result.repeatedInvoiceNumbers.length,
      },
    });

    return {
      exportId: result.exportId,
      invoiceCount: result.invoiceCount,
      warning:
        result.repeatedInvoiceNumbers.length > 0
          ? {
              code: 'DATEV_ALREADY_EXPORTED_INVOICES',
              message: 'Some invoices were already part of a previous DATEV export',
              invoiceNumbers: result.repeatedInvoiceNumbers,
            }
          : null,
      downloadUrl: `/invoicing/datev/exports/${result.exportId}/download`,
      fileStoredPath: result.fileStoredPath,
    };
  }

  async downloadDatevExport(
    id: string,
    tenantId: string,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string }> {
    const exportRow = await this.prisma.datevExport.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        fileStoredPath: true,
      },
    });
    if (!exportRow) throw new NotFoundException('DATEV export not found');

    const opened = await this.datevExportStorage.open(exportRow.fileStoredPath);
    if (!opened) {
      throw new NotFoundException('The stored DATEV export could not be read');
    }

    await this.prisma.datevExport.update({
      where: { id },
      data: { status: DatevExportStatus.downloaded },
    });

    const fileName = this.datevExportStorage.buildFileName(exportRow.periodStart, exportRow.periodEnd);
    return {
      stream: opened.stream,
      fileName,
      mimeType: opened.contentType ?? this.datevExportStorage.mimeTypeFor(exportRow.fileStoredPath),
    };
  }

  private async ensureDatevDebtorNumbers(
    tx: Prisma.TransactionClient,
    tenantId: string,
    companyIds: string[],
    debtorNumberStart: number,
  ): Promise<Map<string, number>> {
    if (companyIds.length === 0) return new Map();

    const companies = await tx.company.findMany({
      where: {
        tenantId,
        id: { in: companyIds },
      },
      select: {
        id: true,
        name: true,
        datevDebtorNumber: true,
      },
      orderBy: { name: 'asc' },
    });

    if (companies.length !== companyIds.length) {
      throw new NotFoundException('One or more companies were not found for DATEV export');
    }

    const maxExistingRow = await tx.company.findFirst({
      where: {
        tenantId,
        datevDebtorNumber: { not: null },
      },
      select: { datevDebtorNumber: true },
      orderBy: { datevDebtorNumber: 'desc' },
    });
    let nextDebtorNumber = Math.max(debtorNumberStart - 1, maxExistingRow?.datevDebtorNumber ?? 0);

    const result = new Map<string, number>();
    for (const company of companies) {
      if (company.datevDebtorNumber !== null) {
        result.set(company.id, company.datevDebtorNumber);
        continue;
      }

      nextDebtorNumber += 1;
      await tx.company.update({
        where: { id: company.id },
        data: { datevDebtorNumber: nextDebtorNumber },
      });
      result.set(company.id, nextDebtorNumber);
    }

    return result;
  }

  private buildDatevExportPayload(buchungsstapelCsv: string, debtorCsv: string): Buffer {
    const separator = '#DEBITORENSTAMM';
    return Buffer.from(`${buchungsstapelCsv}\n${separator}\n${debtorCsv}`, 'utf8');
  }

  /** A failed delivery is a record of its own, so it is written even though nothing was sent. */
  private async recordDeliveryAttempt(params: {
    invoiceId: string;
    actorUserId: string;
    recipientEmail: string;
    ccEmail: string | null;
    mailMode: string;
    status: 'sent' | 'failed';
    errorMessage: string | null;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.invoiceDeliveryAttempt.create({
        data: {
          invoiceId: params.invoiceId,
          recipientEmail: params.recipientEmail,
          ccEmail: params.ccEmail,
          status: params.status,
          mailMode: params.mailMode,
          errorMessage: params.errorMessage,
        },
      });
      await tx.invoiceAuditEvent.create({
        data: {
          invoiceId: params.invoiceId,
          actorUserId: params.actorUserId,
          action: 'send.failed',
          snapshot: {
            recipientEmail: params.recipientEmail,
            ccEmail: params.ccEmail,
            mailMode: params.mailMode,
            errorMessage: params.errorMessage,
          },
        },
      });
    });
  }

  private async readStoredDocument(storedPath: string | null): Promise<Buffer> {
    if (!storedPath) {
      throw new Error('the stored invoice document is missing on the invoice');
    }
    const opened = await this.invoiceDocuments.open(storedPath);
    if (!opened) {
      throw new Error(`the stored invoice document ${storedPath} could not be read`);
    }
    return this.streamToBuffer(opened.stream);
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  /**
   * Serves the document stored at finalize time. Nothing is ever re-rendered here: the
   * bytes a customer receives today must be the bytes that were archived back then.
   */
  async downloadInvoiceDocument(
    id: string,
    kind: 'pdf' | 'xml',
    requestedFormat?: string,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: {
        number: true,
        status: true,
        pdfStoredPath: true,
        zugferdXmlStoredPath: true,
        xrechnungStoredPath: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === OutgoingInvoiceStatus.draft) {
      throw new ConflictException('Draft invoices have no legal documents yet');
    }

    const storedPath =
      kind === 'pdf'
        ? invoice.pdfStoredPath
        : this.resolveXmlStoredPath(invoice, requestedFormat);
    if (!storedPath) {
      throw new NotFoundException('The requested invoice document does not exist');
    }

    const opened = await this.invoiceDocuments.open(storedPath);
    if (!opened) {
      throw new NotFoundException('The stored invoice document could not be read');
    }

    const extension = kind === 'pdf' ? 'pdf' : 'xml';
    return {
      stream: opened.stream,
      fileName: `${invoice.number ?? id}.${extension}`,
      mimeType: opened.contentType ?? this.invoiceDocuments.mimeTypeFor(storedPath),
    };
  }

  private resolveXmlStoredPath(
    invoice: { zugferdXmlStoredPath: string | null; xrechnungStoredPath: string | null },
    requestedFormat?: string,
  ): string | null {
    if (requestedFormat === 'zugferd') return invoice.zugferdXmlStoredPath;
    if (requestedFormat === 'xrechnung') return invoice.xrechnungStoredPath;
    if (requestedFormat !== undefined) {
      throw new BadRequestException('format must be either zugferd or xrechnung');
    }
    // XRechnung is the legally original document wherever it exists, so it wins by default.
    return invoice.xrechnungStoredPath ?? invoice.zugferdXmlStoredPath;
  }

  private parseStatus(value: string): OutgoingInvoiceStatus {
    if (!Object.values(OutgoingInvoiceStatus).includes(value as OutgoingInvoiceStatus)) {
      throw new BadRequestException('Invalid invoice status');
    }
    return value as OutgoingInvoiceStatus;
  }

  private periodForDate(
    value: Date,
    groupBy: 'day' | 'week',
  ): { key: string; start: string; end: string } {
    const day = normalizeDay(value, 'invoiceDate');
    if (groupBy === 'day') {
      const key = day.toISOString().slice(0, 10);
      return { key, start: key, end: key };
    }

    const monday = new Date(day);
    const weekday = monday.getUTCDay();
    const offset = weekday === 0 ? 6 : weekday - 1;
    monday.setUTCDate(monday.getUTCDate() - offset);
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);

    const start = monday.toISOString().slice(0, 10);
    const end = sunday.toISOString().slice(0, 10);
    return {
      key: `${start}_${end}`,
      start,
      end,
    };
  }
}
