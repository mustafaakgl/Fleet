import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  InvoiceLineSource,
  InvoiceTaxCategory,
  InvoiceUnit,
  OutgoingInvoiceStatus,
  Prisma,
} from '@prisma/client';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDraftDto, ManualInvoiceLineDto } from './dto/create-invoice-draft.dto';
import { UpdateInvoiceDraftDto } from './dto/update-invoice-draft.dto';
import { UpsertBillingProfileDto } from './dto/upsert-billing-profile.dto';
import { allocateInvoiceNumber, formatInvoiceNumber } from './invoice-number';
import {
  calculateInvoiceTotals,
  calculateLine,
  formatMilliunits,
  parseQuantityToMilliunits,
  type InvoiceTaxCategoryValue,
} from './money';

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

function assertTaxCombination(category: InvoiceTaxCategory, rate: number): void {
  calculateLine({
    quantityMilliunits: 1_000,
    unitPriceCents: 0,
    taxRateBasisPoints: rate,
    taxCategory: category as InvoiceTaxCategoryValue,
  });
}

@Injectable()
export class InvoicingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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

  /**
   * Turns a draft into a legally binding invoice. Everything happens inside one
   * transaction: a rollback must also roll back the consumed invoice number, and the
   * customer/supplier data is snapshotted because GoBD forbids a finalized invoice from
   * changing when the underlying master data is edited later.
   */
  async finalizeInvoice(id: string, tenantId: string, actorUserId: string) {
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
        iban: profile.iban,
        bic: profile.bic,
        bankName: profile.bankName,
        invoiceNumberFormat: profile.invoiceNumberFormat,
        defaultPaymentTermDays: profile.defaultPaymentTermDays,
        defaultTaxRateBasisPoints: profile.defaultTaxRateBasisPoints,
        smallBusinessRule: profile.smallBusinessRule,
        invoiceFooterText: profile.invoiceFooterText,
      };

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
          customerName: company.billingName?.trim() || company.name,
          customerStreet: company.billingStreet,
          customerPostalCode: company.billingPostalCode,
          customerCity: company.billingCity,
          customerCountryCode: company.billingCountryCode,
          customerVatId: company.vatId,
          customerEmail: company.invoiceEmail,
          supplierSnapshot,
          notes: profile.smallBusinessRule
            ? appendNote(existing.notes, SMALL_BUSINESS_NOTE)
            : existing.notes,
          finalizedAt: new Date(),
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
