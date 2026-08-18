import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentOwnerType,
  DocumentStatus,
  FineStatus,
  FineViolationCategory,
  FuelEntryWorkflowStatus,
  IntakeDocumentStatus,
  Prisma,
  ReminderType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AutomationCheckResult } from './core/automation-check.contract';
import { AutomationJobService } from './automation-job.service';
import { DocumentIntakeService } from './document-intake.service';
import { buildRoutingPlan, hasReliableDate } from './core/intake-routing-plan';

/**
 * YONLENDIRME — MEVCUT SURECLERE DEVIR (Faz 14).
 *
 * BELGE SINIFLANDIRMA ONAYI, FINANSAL YA DA DOMAIN ONAYI DEGILDIR. Bu servis
 * hicbir yerde bir hedefin kendi yasam dongusunu ya da guard'ini ATLAMAZ:
 *   - servis faturasi Faz 13'un oneri/onay dongusune girer,
 *   - yakit fisi muhasebe incelemesine girer, ONAYLANMIS GIDER OLMAZ,
 *   - muayene/sigorta arac belgesi olur; hatirlatma yalnizca tarih GUVENILIR
 *     ve kullanici acikca istediyse,
 *   - trafik cezasi yalnizca yazma yetkisi olan rolun ACIK onayiyla olusur.
 *
 * EXACTLY-ONCE: canonical kayit ile `IntakeDocumentRouting` satiri AYNI
 * TRANSACTION'da yaziliyor. `intakeDocumentId` TEKIL oldugu icin, eszamanli
 * ikinci istek yaris kaybettiginde KENDI domain kaydi da geri aliniyor.
 * Uygulama kontrolu tek basina bunu garanti EDEMEZDI.
 *
 * PARALEL MODEL YOK: olusan kayitlarin hepsi repodaki MEVCUT modeller.
 */

export interface FuelReceiptConfirmation {
  enteredAt: string;
  liters: number;
  totalCost: number;
  currency: string;
  odometerKm?: number;
}

export interface VehicleDocumentConfirmation {
  documentType: string;
  /** Gecerlilik sonu. Hatirlatma icin ZORUNLU degil ama onsuz hatirlatma da yok. */
  expiryDate?: string | null;
  /** Kullanici hatirlatmayi ACIKCA istedi mi. Varsayilan HAYIR. */
  createReminder?: boolean;
  notifyBeforeDays?: number;
}

export interface FineConfirmation {
  violationAt: string;
  violationLocation: string;
  violationType: string;
  violationCategory: FineViolationCategory;
  amount?: number;
  currency?: string;
  paymentDueDate?: string | null;
}

export interface RouteInput {
  fuelReceipt?: FuelReceiptConfirmation;
  vehicleDocument?: VehicleDocumentConfirmation;
  fine?: FineConfirmation;
}

export interface RouteResult {
  documentId: string;
  destination: string;
  entityType: string;
  entityId: string;
  secondaryEntityType: string | null;
  secondaryEntityId: string | null;
  /** Tekrarlanan istek: ikinci kayit URETILMEDI. */
  alreadyRouted: boolean;
}

/** Muayene alt turune gore hatirlatma turu. `unknown` alt turde hatirlatma YOK. */
const INSPECTION_REMINDER: Record<string, ReminderType> = {
  tuv: ReminderType.tuv_expiry,
  sp: ReminderType.sp_expiry,
};

@Injectable()
export class IntakeRoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly intake: DocumentIntakeService,
    private readonly jobs: AutomationJobService,
  ) {}

  async route(
    userId: string,
    role: string | null,
    documentId: string,
    input: RouteInput,
  ): Promise<RouteResult> {
    const row = await this.intake.loadForRouting(documentId);
    if (!row) {
      throw new NotFoundException({ code: 'document_intake_not_found' });
    }

    // TEKRARLANAN ISTEK: ikinci kayit URETILMEZ, var olan bag donulur.
    if (row.routing) {
      const existing = await this.prisma.intakeDocumentRouting.findFirst({
        where: { intakeDocumentId: documentId },
        select: {
          destination: true,
          entityType: true,
          entityId: true,
          secondaryEntityType: true,
          secondaryEntityId: true,
        },
      });
      return {
        documentId,
        destination: existing!.destination,
        entityType: existing!.entityType,
        entityId: existing!.entityId,
        secondaryEntityType: existing!.secondaryEntityType,
        secondaryEntityId: existing!.secondaryEntityId,
        alreadyRouted: true,
      };
    }

    const checks = (Array.isArray(row.checks) ? row.checks : []) as unknown as AutomationCheckResult[];
    const plan = buildRoutingPlan({
      typeKey: row.typeKey,
      role,
      vehicleId: row.vehicleId,
      vehicleMatchStatus: row.vehicleMatchStatus,
      driverId: row.driverId,
      checks,
      alreadyRouted: false,
    });

    // ROL KONTROLU HEDEFIN KENDI KISITINDAN. Gelen kutusu gevsetemez.
    if (plan.blockedBy.includes('role_not_allowed')) {
      throw new ForbiddenException({ code: 'document_intake_role_not_allowed' });
    }
    // TUR SECILMEDEN KAYIT OLUSMAZ.
    if (plan.blockedBy.includes('type_unknown')) {
      throw new BadRequestException({ code: 'document_intake_type_required' });
    }

    // GUVENLI ESLEME YOKSA PARALEL MODEL UYDURULMAZ: belge burada bekler.
    const domainBlockers = plan.blockedBy.filter(
      (reason) => reason === 'driver_required' || reason === 'vehicle_required' || reason === 'vehicle_match_failed',
    );
    if (domainBlockers.length > 0) {
      await this.prisma.intakeDocument.updateMany({
        where: { id: documentId, status: { not: IntakeDocumentStatus.routed } },
        data: {
          status: IntakeDocumentStatus.needs_domain_review,
          domainReviewReason: domainBlockers.join(','),
        },
      });
      throw new ConflictException({
        code: 'document_intake_needs_domain_review',
        blockedBy: domainBlockers,
      });
    }

    switch (plan.destination) {
      case 'ordivan.service_invoice':
        return this.routeServiceInvoice(userId, row);
      case 'fleet.fuel_entry_review':
        return this.routeFuelReceipt(userId, row, input.fuelReceipt);
      case 'vehicle.document':
        return this.routeVehicleDocument(userId, row, checks, input.vehicleDocument);
      case 'fine.record':
        return this.routeFine(userId, row, input.fine);
      default:
        throw new BadRequestException({ code: 'document_intake_type_required' });
    }
  }

  /**
   * Ortak kapanis: canonical kayit + yonlendirme bagi + belge durumu AYNI
   * TRANSACTION'da. Tekillik ihlali ikinci kaydi geri alir.
   */
  private async commit(
    documentId: string,
    destination: string,
    create: (tx: Prisma.TransactionClient) => Promise<{
      entityType: string;
      entityId: string;
      secondaryEntityType?: string | null;
      secondaryEntityId?: string | null;
    }>,
    userId: string,
  ): Promise<RouteResult> {
    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        const created = await create(tx);

        await tx.intakeDocumentRouting.create({
          data: {
            intakeDocumentId: documentId,
            destination,
            entityType: created.entityType,
            entityId: created.entityId,
            secondaryEntityType: created.secondaryEntityType ?? null,
            secondaryEntityId: created.secondaryEntityId ?? null,
            routedById: userId,
          },
        });

        await tx.intakeDocument.updateMany({
          where: { id: documentId },
          data: {
            status: IntakeDocumentStatus.routed,
            decidedById: userId,
            decidedAt: new Date(),
            domainReviewReason: null,
          },
        });

        return created;
      });

      await this.audit.logAction({
        actorUserId: userId,
        action: 'document_intake.routed',
        entityType: 'IntakeDocument',
        entityId: documentId,
        summary: `Posteingang-Dokument weitergeleitet (${destination})`,
        // HANGI KAYIT olustu — DEGERLERI degil.
        metadata: {
          documentId,
          destination,
          entityType: outcome.entityType,
          entityId: outcome.entityId,
          secondaryEntityType: outcome.secondaryEntityType ?? null,
        },
      });

      await this.intake.settleIntakeOf(documentId);

      return {
        documentId,
        destination,
        entityType: outcome.entityType,
        entityId: outcome.entityId,
        secondaryEntityType: outcome.secondaryEntityType ?? null,
        secondaryEntityId: outcome.secondaryEntityId ?? null,
        alreadyRouted: false,
      };
    } catch (error) {
      // TEKILLIK IHLALI = eszamanli ikinci yonlendirme. Kendi domain kaydi
      // ZATEN geri alindi; var olan bag donuluyor.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.intakeDocumentRouting.findFirst({
          where: { intakeDocumentId: documentId },
          select: {
            destination: true,
            entityType: true,
            entityId: true,
            secondaryEntityType: true,
            secondaryEntityId: true,
          },
        });
        if (existing) {
          return {
            documentId,
            destination: existing.destination,
            entityType: existing.entityType,
            entityId: existing.entityId,
            secondaryEntityType: existing.secondaryEntityType,
            secondaryEntityId: existing.secondaryEntityId,
            alreadyRouted: true,
          };
        }
      }
      throw error;
    }
  }

  /**
   * SERVIS FATURASI → Faz 13 akisi.
   *
   * DOSYA IKINCI KEZ YUKLENMEZ: is AYNI artifact'e baglaniyor. Faz 13'un kendi
   * oneri/inceleme/onay dongusu degismeden calisiyor; `ServiceRecord` BURADA
   * olusmuyor.
   */
  private async routeServiceInvoice(
    userId: string,
    row: NonNullable<Awaited<ReturnType<DocumentIntakeService['loadForRouting']>>>,
  ): Promise<RouteResult> {
    const artifact = row.intake.artifact;
    return this.commit(
      row.id,
      'ordivan.service_invoice',
      async () => {
        const job = await this.jobs.createJob(userId, {
          jobType: 'document.service_invoice.extract',
          schemaVersion: 1,
          // Belge ICERIGI is kaydina girmez; yalnizca kimligi ve boyutu.
          payload: {
            documentId: artifact.id,
            originalName: artifact.originalName,
            contentLength: artifact.fileSize,
          },
          documentId: artifact.id,
        });
        return { entityType: 'AutomationJob', entityId: job.id };
      },
      userId,
    );
  }

  /**
   * YAKIT FISI → mevcut MUHASEBE incelemesi.
   *
   * `submitted`: surucu dogrulamasi atlaniyor (belgeyi buro yukledi) ama
   * MUHASEBE ONAYI ATLANMIYOR. `approved` RAPORLARA GIREN TEK DURUM ve buraya
   * asla yazilmiyor — gelen kutusundan dogrudan onaylanmis gider olusturmak,
   * muhasebenin var olma sebebini ortadan kaldirirdi.
   */
  private async routeFuelReceipt(
    userId: string,
    row: NonNullable<Awaited<ReturnType<DocumentIntakeService['loadForRouting']>>>,
    confirmation: FuelReceiptConfirmation | undefined,
  ): Promise<RouteResult> {
    if (!confirmation) {
      throw new BadRequestException({ code: 'fuel_receipt_confirmation_required' });
    }
    const enteredAt = new Date(confirmation.enteredAt);
    if (Number.isNaN(enteredAt.getTime())) {
      throw new BadRequestException({ code: 'fuel_receipt_date_invalid' });
    }
    const liters = Number(confirmation.liters);
    const totalCost = Number(confirmation.totalCost);
    // `submitted`e gecmeden once ikisi de ZORUNLU (bkz. FleetFuelEntry).
    if (!Number.isFinite(liters) || liters <= 0) {
      throw new BadRequestException({ code: 'fuel_receipt_liters_invalid' });
    }
    if (!Number.isFinite(totalCost) || totalCost <= 0) {
      throw new BadRequestException({ code: 'fuel_receipt_cost_invalid' });
    }
    const currency = (confirmation.currency ?? '').trim().toUpperCase();
    if (currency.length !== 3) {
      // EUR VARSAYILMIYOR.
      throw new BadRequestException({ code: 'fuel_receipt_currency_required' });
    }

    return this.commit(
      row.id,
      'fleet.fuel_entry_review',
      async (tx) => {
        const entry = await tx.fleetFuelEntry.create({
          data: {
            vehicleId: row.vehicleId!,
            driverId: row.driverId!,
            enteredAt,
            liters: new Prisma.Decimal(liters.toFixed(3)),
            totalCost: new Prisma.Decimal(totalCost.toFixed(2)),
            currency,
            odometerKm:
              typeof confirmation.odometerKm === 'number'
                ? new Prisma.Decimal(confirmation.odometerKm.toFixed(3))
                : null,
            // MUHASEBE INCELEMESINE girer. `approved` DEGIL.
            workflowStatus: FuelEntryWorkflowStatus.submitted,
            submittedAt: new Date(),
            receiptOriginalName: row.intake.artifact.originalName,
            receiptMimeType: row.intake.artifact.mimeType,
            receiptFileSize: row.intake.artifact.fileSize,
          },
          select: { id: true },
        });
        return { entityType: 'FleetFuelEntry', entityId: entry.id };
      },
      userId,
    );
  }

  /**
   * TUV/SP VE SIGORTA → mevcut arac belgesi sureci.
   *
   * HATIRLATMA TASLAK/ONERI: yalnizca (a) tarih kontrolu `verified` ve
   * (b) kullanici ACIKCA istediyse olusur. Guvenilmeyen bir tarihten
   * hatirlatma uretmek, yanlis gunde "muayene doldu" diyen bir sistemin en
   * hizli yoludur — ve bir kez guven kaybedildiginde butun hatirlatmalar
   * gormezden gelinir.
   */
  private async routeVehicleDocument(
    userId: string,
    row: NonNullable<Awaited<ReturnType<DocumentIntakeService['loadForRouting']>>>,
    checks: AutomationCheckResult[],
    confirmation: VehicleDocumentConfirmation | undefined,
  ): Promise<RouteResult> {
    if (!confirmation?.documentType?.trim()) {
      throw new BadRequestException({ code: 'vehicle_document_type_required' });
    }

    const expiryDate = confirmation.expiryDate ? new Date(confirmation.expiryDate) : null;
    if (confirmation.expiryDate && Number.isNaN(expiryDate!.getTime())) {
      throw new BadRequestException({ code: 'vehicle_document_expiry_invalid' });
    }

    const wantsReminder = confirmation.createReminder === true;
    if (wantsReminder) {
      if (!expiryDate) {
        throw new BadRequestException({ code: 'vehicle_document_reminder_needs_expiry' });
      }
      // TARIH GUVENILIR DEGILSE hatirlatma YOK — kullanici istese bile.
      if (!hasReliableDate(checks)) {
        throw new BadRequestException({ code: 'vehicle_document_reminder_date_unreliable' });
      }
    }

    const reminderType =
      row.typeKey === 'vehicle_insurance@v1'
        ? ReminderType.insurance_expiry
        : INSPECTION_REMINDER[row.subtype ?? ''] ?? null;

    return this.commit(
      row.id,
      'vehicle.document',
      async (tx) => {
        const document = await tx.document.create({
          data: {
            ownerType: DocumentOwnerType.vehicle,
            ownerId: row.vehicleId!,
            documentType: confirmation.documentType.trim().slice(0, 120),
            fileName: row.intake.artifact.originalName,
            expiryDate,
            status: DocumentStatus.valid,
            uploadedById: userId,
          },
          select: { id: true },
        });

        // Alt turu `unknown` olan muayenede hatirlatma turu de yok: hangi
        // sureye hatirlatma kuracagimizi BILMIYORUZ.
        if (!wantsReminder || !reminderType || !expiryDate) {
          return { entityType: 'Document', entityId: document.id };
        }

        const notifyBeforeDays = Math.min(
          Math.max(Number(confirmation.notifyBeforeDays ?? 30), 1),
          365,
        );
        const reminder = await tx.reminder.create({
          data: {
            targetType: 'vehicle',
            targetId: row.vehicleId!,
            reminderType,
            title: confirmation.documentType.trim().slice(0, 120),
            dueDate: expiryDate,
            notifyBeforeDays,
            metadata: { intakeDocumentId: row.id, documentId: document.id },
          },
          select: { id: true },
        });

        return {
          entityType: 'Document',
          entityId: document.id,
          secondaryEntityType: 'Reminder',
          secondaryEntityId: reminder.id,
        };
      },
      userId,
    );
  }

  /**
   * TRAFIK CEZASI → mevcut Fine sureci.
   *
   * DEGERLER BELGEDEN OKUNUP DOGRUDAN YAZILMIYOR: ihlal ani, yeri, turu ve
   * kategorisi INSANIN onayladigi degerlerdir. Adaylar arayuzde on-doldurma
   * icin gosterilir; kayda giren sey kullanicinin gonderdigidir.
   *
   * Rol kontrolu cagiran tarafta yapildi (`OPERATIONAL_WRITE_ROLES`), muhasebe
   * DISARIDA.
   */
  private async routeFine(
    userId: string,
    row: NonNullable<Awaited<ReturnType<DocumentIntakeService['loadForRouting']>>>,
    confirmation: FineConfirmation | undefined,
  ): Promise<RouteResult> {
    if (!confirmation) {
      throw new BadRequestException({ code: 'fine_confirmation_required' });
    }
    const violationAt = new Date(confirmation.violationAt);
    if (Number.isNaN(violationAt.getTime())) {
      throw new BadRequestException({ code: 'fine_violation_date_invalid' });
    }
    const location = (confirmation.violationLocation ?? '').trim();
    if (!location) {
      throw new BadRequestException({ code: 'fine_violation_location_required' });
    }
    const violationType = (confirmation.violationType ?? '').trim();
    if (!violationType) {
      throw new BadRequestException({ code: 'fine_violation_type_required' });
    }
    if (!Object.values(FineViolationCategory).includes(confirmation.violationCategory)) {
      throw new BadRequestException({ code: 'fine_violation_category_invalid' });
    }

    const amount = confirmation.amount;
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0 || amount > 100_000)) {
      throw new BadRequestException({ code: 'fine_amount_invalid' });
    }
    const currency = (confirmation.currency ?? 'EUR').trim().toUpperCase();
    if (currency.length !== 3) {
      throw new BadRequestException({ code: 'fine_currency_invalid' });
    }

    const paymentDueDate = confirmation.paymentDueDate
      ? new Date(confirmation.paymentDueDate)
      : null;
    if (confirmation.paymentDueDate && Number.isNaN(paymentDueDate!.getTime())) {
      throw new BadRequestException({ code: 'fine_due_date_invalid' });
    }

    return this.commit(
      row.id,
      'fine.record',
      async (tx) => {
        const fine = await tx.fine.create({
          data: {
            vehicleId: row.vehicleId!,
            violationAt,
            violationLocation: location.slice(0, 300),
            violationType: violationType.slice(0, 200),
            violationCategory: confirmation.violationCategory,
            amount: amount === undefined ? null : new Prisma.Decimal(amount.toFixed(2)),
            currency,
            paymentDueDate,
            // Surucu eslestirmesi MEVCUT surecin isi; burada yapilmiyor.
            status: FineStatus.neu,
            createdByUserId: userId,
          },
          select: { id: true },
        });
        return { entityType: 'Fine', entityId: fine.id };
      },
      userId,
    );
  }
}
