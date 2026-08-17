import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  FuelEntryWorkflowStatus,
  FuelProductType,
  FuelReceiptOcrStatus,
  FuelingIntentStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { OperationalNotifyService } from '../../notifications/operational-notify.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FUEL_RECEIPT_UPLOAD_ABSOLUTE_DIR } from '../../storage/local-storage.service';
import { StorageService } from '../../storage/storage.service';
import { compatibleProductsForStationFilter } from '../fuel-stations/core/fuel-compatibility.util';
import { OCR_RETRY_COOLDOWN_MS } from './fuel-receipt-ocr.config';
import {
  effectiveAccountingStatus,
  type EffectiveAccountingStatus,
} from './core/effective-fuel-cost';
import { VehicleFuelCompatibilityService } from '../fuel-stations/vehicle-fuel-compatibility.service';
import { DriverVehicleService } from '../driver-vehicle.service';
import {
  hasBlockingIssue,
  isMixedReceipt,
  validateFuelReceiptDraft,
  type FuelReceiptIssue,
} from './core/fuel-receipt-validation.util';
import {
  detectReceiptFileKind,
  extensionForKind,
  isSupportedReceiptKind,
  sanitizeReceiptFileName,
  MAX_RECEIPT_FILE_BYTES,
} from './core/receipt-file.util';
import type { ConfirmFuelReceiptDto } from './dto/confirm-fuel-receipt.dto';
import {
  FUEL_RECEIPT_OCR_PROVIDER,
  type FuelReceiptOcrProvider,
  type NormalizedFuelReceiptExtraction,
} from './fuel-receipt-ocr.types';

export interface UploadedReceiptBuffer {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Surucuye donen gorunum. HAM DOSYA YOLU BURADA YOK. */
export interface FuelReceiptView {
  id: string;
  workflowStatus: FuelEntryWorkflowStatus;
  /**
   * Muhasebe acisindan ETKILI durum (Faz 9).
   *
   * Surucuye giden bildirim "fisiniz duzeltmeye alindi" derken ekranin
   * "Freigegeben" demesi CELISKIYDI. `workflowStatus` ham gercegi tasimaya
   * devam ediyor; bu alan "su anda gecerli mi" sorusuna cevap veriyor ve
   * muhasebe uclariyla AYNI turetmeden geciyor.
   */
  effectiveAccountingStatus: EffectiveAccountingStatus;
  ocrStatus: FuelReceiptOcrStatus;
  ocrDataMode: string | null;
  ocrErrorClass: string | null;
  /** Alan basina { value, confidence } — surucunun formuna TASLAK olarak gelir. */
  ocrExtraction: NormalizedFuelReceiptExtraction | null;
  vehicle: { id: string; plateNumber: string };
  fuelingIntentId: string | null;
  /** Fis goruntusunun YETKILI indirme yolu; ham depolama yolu degil. */
  fileDownloadPath: string | null;
  fileName: string | null;
  mimeType: string | null;
  enteredAt: string;
  purchasedAt: string | null;
  stationName: string | null;
  stationAddress: string | null;
  receiptNumber: string | null;
  fuelProduct: FuelProductType | null;
  liters: number | null;
  pricePerLiter: number | null;
  /** YAKIT satirinin brut toplami — araca yazilan maliyet. */
  fuelGrossAmount: number | null;
  /** Fisin GENEL brut toplami — kasada odenen. */
  receiptGrossAmount: number | null;
  receiptNetAmount: number | null;
  receiptVatAmount: number | null;
  receiptVatRate: number | null;
  currency: string;
  paymentMethod: string | null;
  odometerKm: number | null;
  receiptPlateNumber: string | null;
  isFullTank: boolean;
  compatibilityMismatch: boolean;
  submittedAt: string | null;
  /** Muhasebenin SON ret nedeni — surucuye gosterilir (Faz 7). */
  rejectionReason: string | null;
  rejectedAt: string | null;
  createdAt: string;
}

const RECEIPT_SELECT = {
  id: true,
  tenantId: true,
  driverId: true,
  vehicleId: true,
  enteredAt: true,
  liters: true,
  totalCost: true,
  currency: true,
  odometerKm: true,
  isFullTank: true,
  receiptStoredPath: true,
  receiptMimeType: true,
  receiptOriginalName: true,
  receiptFileHash: true,
  workflowStatus: true,
  submittedAt: true,
  stationName: true,
  stationAddress: true,
  receiptNumber: true,
  fuelProduct: true,
  pricePerLiter: true,
  receiptGrossAmount: true,
  receiptNetAmount: true,
  receiptVatAmount: true,
  receiptVatRate: true,
  paymentMethod: true,
  receiptPlateNumber: true,
  compatibilityMismatch: true,
  // Ters kayit iliskisi: etkili durumu ikinci bir sorguyla cozmek, liste
  // buyudukce satir basina bir istek (N+1) demekti.
  reversal: { select: { id: true } },
  rejectionReason: true,
  rejectedAt: true,
  ocrStatus: true,
  ocrProvider: true,
  ocrProcessedAt: true,
  ocrExtraction: true,
  ocrErrorClass: true,
  ocrDataMode: true,
  fuelingIntentId: true,
  createdAt: true,
  vehicle: { select: { id: true, plateNumber: true } },
} satisfies Prisma.FleetFuelEntrySelect;

type ReceiptRow = Prisma.FleetFuelEntryGetPayload<{ select: typeof RECEIPT_SELECT }>;

function num(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

/**
 * Yakit fisi yukleme, OCR taslagi ve surucu dogrulamasi.
 *
 * CANONICAL MODEL FleetFuelEntry — paralel bir fis tablosu YOK. Fis, yakit
 * isleminin kendisidir; ayri bir tabloda tutmak ayni gercegi iki yerde saklar
 * ve raporlarin hangisini saydigini belirsiz birakirdi.
 *
 * IKI DURUM AYRI: `ocrStatus` teknik (okuma calisti mi), `workflowStatus` is
 * akisi (kim ne onayladi). OCR basarisiz olsa bile fis kaybolmaz ve surucu
 * formu elle doldurup gonderebilir.
 *
 * OCR SONUCU CANONICAL DEGILDIR: `ocrExtraction` yalnizca taslaktir ve
 * surucunun confirm'i olmadan tek bir canonical alana yazilmaz.
 */
@Injectable()
export class FuelReceiptService {
  private readonly logger = new Logger(FuelReceiptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly driverVehicle: DriverVehicleService,
    private readonly compatibility: VehicleFuelCompatibilityService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly operationalNotify: OperationalNotifyService,
    @Inject(FUEL_RECEIPT_OCR_PROVIDER) private readonly ocr: FuelReceiptOcrProvider,
  ) {}

  /** Oturumdan surucu + BUGUNKU ARAC. Istemci hicbirini secemez. */
  private async resolveOwner(userId: string): Promise<{ driverId: string; vehicleId: string; plateNumber: string }> {
    const driver = await this.driverVehicle.requireDriverForUser(userId);
    const vehicle = await this.driverVehicle.resolveTodayVehicle(driver.id);
    if (!vehicle) {
      throw new ConflictException({ code: 'driver_vehicle_not_resolved' });
    }
    return { driverId: driver.id, vehicleId: vehicle.id, plateNumber: vehicle.plateNumber };
  }

  /**
   * Fisi yukler.
   *
   * `fuelingIntentId` OPSIYONEL ve hicbir zaman zorunlu olmayacak: surucu aktif
   * turu ya da istasyon secimi olmadan da fis yukleyebilmeli.
   */
  async upload(
    userId: string,
    file: UploadedReceiptBuffer | undefined,
    fuelingIntentId?: string,
  ): Promise<FuelReceiptView> {
    if (!file) {
      throw new BadRequestException({ code: 'receipt_file_missing' });
    }
    if (file.size > MAX_RECEIPT_FILE_BYTES) {
      throw new BadRequestException({ code: 'receipt_file_too_large' });
    }

    // GERCEK tur ilk baytlardan. Istemcinin bildirdigi MIME ve uzanti
    // serbestce yazilabilir; `evil.php` dosyasini `image/jpeg` diye gondermek
    // tek satirlik bir istektir.
    const kind = detectReceiptFileKind(file.buffer.subarray(0, 16));
    if (!isSupportedReceiptKind(kind)) {
      throw new BadRequestException({ code: 'receipt_file_type_unsupported' });
    }

    const owner = await this.resolveOwner(userId);
    const hash = createHash('sha256').update(file.buffer).digest('hex');

    // Ayni kiraci icinde birebir ayni dosya: yeni kayit URETILMEZ, var olan
    // doner. Sessizce ikinci bir maliyet satiri yaratmak, ayni fisin iki kez
    // muhasebelesmesi demek olurdu.
    const existing = await this.prisma.fleetFuelEntry.findFirst({
      where: { receiptFileHash: hash },
      select: RECEIPT_SELECT,
    });
    if (existing) {
      return this.toView(existing);
    }

    const intentId = await this.resolveUploadIntent(owner, fuelingIntentId);

    const storedFileName = `${randomUUID()}${extensionForKind(kind)}`;
    const absolutePath = join(FUEL_RECEIPT_UPLOAD_ABSOLUTE_DIR, storedFileName);

    // Once DOSYA, sonra DB: DB yazimi patlarsa dosyayi geri aliyoruz. Ters sira
    // olsaydi, dosya yazimi patladiginda elimizde goruntusu olmayan bir fis
    // kaydi kalirdi ve surucu onu ne silebilir ne de duzeltebilirdi.
    await writeFile(absolutePath, file.buffer);

    try {
      const created = await this.prisma.fleetFuelEntry.create({
        data: {
          driverId: owner.driverId,
          vehicleId: owner.vehicleId,
          // Yukleme ani. Surucu confirm'de fisteki GERCEK tarihi giriyor.
          enteredAt: new Date(),
          // Mali alanlar bilincli olarak BOS: fis yeni yuklendi, degerler
          // heniz okunmadi. 0 yazmak "bedava yakit" demek olurdu.
          liters: null,
          totalCost: null,
          currency: 'EUR',
          workflowStatus: FuelEntryWorkflowStatus.driver_review,
          ocrStatus: FuelReceiptOcrStatus.not_requested,
          receiptStoredPath: this.storage.buildStoredPath('fuel-receipts', storedFileName),
          receiptMimeType: kind,
          receiptOriginalName: sanitizeReceiptFileName(file.originalname),
          receiptFileHash: hash,
          receiptFileSize: file.size,
          fuelingIntentId: intentId,
        },
        select: RECEIPT_SELECT,
      });

      await this.audit.logAction({
        actorUserId: userId,
        action: 'fuel_receipt.uploaded',
        entityType: 'FleetFuelEntry',
        entityId: created.id,
        summary: `Tankbeleg hochgeladen (${created.vehicle.plateNumber})`,
        metadata: this.auditMetadata(created),
      });

      return this.toView(created);
    } catch (error) {
      // ORPHAN DOSYA BIRAKMA: DB yazimi basarisizsa diskteki dosya da gider.
      await unlink(absolutePath).catch(() => undefined);

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Yaris: ayni dosya es zamanli iki kez yuklendi. Ikincisi kaybeder ama
        // cagirana hata donmez — fis zaten kayitli.
        const winner = await this.prisma.fleetFuelEntry.findFirst({
          where: { receiptFileHash: hash },
          select: RECEIPT_SELECT,
        });
        if (winner) {
          return this.toView(winner);
        }
      }
      throw error;
    }
  }

  /**
   * Yukleme aninda verilen yakit niyeti bagini DOGRULAR.
   *
   * Bag opsiyonel; gecersizse istegi reddediyoruz (sessizce dusurmuyoruz):
   * surucu bilincli olarak "bu yakit alimi icin" dedi, yanlis niyete baglamak
   * ya da sessizce bagsiz kaydetmek ikisi de yaniltici olurdu.
   */
  private async resolveUploadIntent(
    owner: { driverId: string; vehicleId: string },
    fuelingIntentId?: string,
  ): Promise<string | null> {
    if (!fuelingIntentId) {
      return null;
    }

    const intent = await this.prisma.fuelingIntent.findFirst({
      where: { id: fuelingIntentId },
      select: { id: true, driverId: true, vehicleId: true, status: true },
    });

    // Baska kiracinin/surucunun niyeti: VAR OLDUGU BILE sizdirilmiyor.
    if (!intent || intent.driverId !== owner.driverId) {
      throw new NotFoundException({ code: 'fueling_intent_not_found' });
    }
    if (intent.vehicleId !== owner.vehicleId) {
      throw new ConflictException({ code: 'fueling_intent_vehicle_mismatch' });
    }
    // Iptal edilmis niyete sonradan fis BAGLANMAZ. Surucu ayni fisi bagsiz
    // yukleyebilir — bu yol hicbir zaman kapanmiyor.
    if (
      intent.status !== FuelingIntentStatus.ACTIVE &&
      intent.status !== FuelingIntentStatus.COMPLETED
    ) {
      throw new ConflictException({ code: 'fueling_intent_not_linkable' });
    }

    const settled = await this.prisma.fleetFuelEntry.findFirst({
      where: {
        fuelingIntentId,
        workflowStatus: {
          in: [FuelEntryWorkflowStatus.submitted, FuelEntryWorkflowStatus.approved],
        },
      },
      select: { id: true },
    });
    if (settled) {
      throw new ConflictException({ code: 'fueling_intent_already_settled' });
    }

    return intent.id;
  }

  /**
   * OCR'i calistirir.
   *
   * ES ZAMANLILIK: durum `processing`'e YALNIZCA `not_requested`/`failed`
   * ikeninden gecirilebiliyor (kosullu updateMany). Ikinci es zamanli istek
   * count=0 alir ve saglayiciya HIC gitmez — aksi halde ayni fis icin iki kez
   * odenir ve iki sonuc birbirini ezerdi.
   */
  async analyze(userId: string, receiptId: string): Promise<FuelReceiptView> {
    const owner = await this.resolveOwner(userId);
    const receipt = await this.requireOwnDraft(owner.driverId, receiptId);

    /**
     * YENIDEN DENEME BEKLEME SURESI (Faz 10).
     *
     * Her deneme UCRETLI bir dis cagri. Onceki denemenin uzerinden yeterli
     * sure gecmediyse yeni cagri BASLATILMIYOR ve mevcut durum donuyor —
     * hizli hizli dokunulan bir dugme, faturayi katlamamali.
     *
     * Hata DEGIL, mevcut durum donuyor: surucu zaten sonucu bekliyor ve
     * ona teknik bir ret gostermek bir sey kazandirmaz.
     */
    if (receipt.ocrProcessedAt) {
      const sinceLastAttempt = Date.now() - receipt.ocrProcessedAt.getTime();
      if (sinceLastAttempt < OCR_RETRY_COOLDOWN_MS) {
        return this.toView(receipt);
      }
    }

    const claimed = await this.prisma.fleetFuelEntry.updateMany({
      where: {
        id: receipt.id,
        driverId: owner.driverId,
        workflowStatus: FuelEntryWorkflowStatus.driver_review,
        ocrStatus: {
          in: [FuelReceiptOcrStatus.not_requested, FuelReceiptOcrStatus.failed],
        },
      },
      data: { ocrStatus: FuelReceiptOcrStatus.processing, ocrErrorClass: null },
    });

    if (claimed.count === 0) {
      // Baska bir istek zaten calistiriyor ya da sonuc hazir. Mevcut durumu
      // donuyoruz; ikinci bir analiz baslatmiyoruz.
      return this.toView(await this.requireOwnDraft(owner.driverId, receiptId));
    }

    await this.audit.logAction({
      actorUserId: userId,
      action: 'fuel_receipt.ocr_started',
      entityType: 'FleetFuelEntry',
      entityId: receipt.id,
      summary: `OCR gestartet (${this.ocr.name})`,
      metadata: this.auditMetadata(receipt),
    });

    const absolutePath = this.absolutePathFor(receipt);
    let result;
    try {
      result = await this.ocr.analyze({
        absolutePath,
        originalName: receipt.receiptOriginalName ?? '',
        mimeType: receipt.receiptMimeType ?? 'application/octet-stream',
        sizeBytes: 0,
      });
    } catch (error) {
      // Saglayici mesaji ve yigin izi LOGA VE VERITABANINA GIRMEZ: fis metni ve
      // odeme bilgisi tasiyabilir. Yalnizca teknik olmayan sinif saklaniyor.
      this.logger.warn(`Fuel receipt OCR threw for ${receipt.id} — recorded as provider_unavailable`);
      result = { ok: false as const, errorClass: 'provider_unavailable' as const };
    }

    const updated = await this.prisma.fleetFuelEntry.update({
      where: { id: receipt.id },
      data: result.ok
        ? {
            ocrStatus: FuelReceiptOcrStatus.succeeded,
            ocrProvider: this.ocr.name,
            ocrProviderVersion: this.ocr.version,
            ocrProcessedAt: new Date(),
            ocrDataMode: this.ocr.dataMode,
            ocrErrorClass: null,
            // TASLAK — canonical alanlara YAZILMIYOR. Surucu onaylamadan
            // hicbir deger maliyete donusmez.
            ocrExtraction: result.extraction as unknown as Prisma.InputJsonValue,
          }
        : {
            ocrStatus: FuelReceiptOcrStatus.failed,
            ocrProvider: this.ocr.name,
            ocrProviderVersion: this.ocr.version,
            ocrProcessedAt: new Date(),
            ocrDataMode: this.ocr.dataMode,
            ocrErrorClass: result.errorClass,
          },
      select: RECEIPT_SELECT,
    });

    await this.audit.logAction({
      actorUserId: userId,
      action: result.ok ? 'fuel_receipt.ocr_succeeded' : 'fuel_receipt.ocr_failed',
      entityType: 'FleetFuelEntry',
      entityId: receipt.id,
      summary: result.ok
        ? `OCR erfolgreich (${this.ocr.name})`
        : `OCR fehlgeschlagen: ${result.errorClass}`,
      metadata: this.auditMetadata(updated),
    });

    return this.toView(updated);
  }

  async getById(userId: string, receiptId: string): Promise<FuelReceiptView> {
    const driver = await this.driverVehicle.requireDriverForUser(userId);
    const row = await this.prisma.fleetFuelEntry.findFirst({
      where: { id: receiptId, driverId: driver.id },
      select: RECEIPT_SELECT,
    });
    // Baska surucunun/kiracinin fisi VAR OLDUGU BILE sizdirilmiyor: 404.
    if (!row) {
      throw new NotFoundException({ code: 'fuel_receipt_not_found' });
    }
    return this.toView(row);
  }

  /** Surucunun kendi fisleri — yalnizca fis akisindan dogmus olanlar. */
  async list(userId: string, limit = 30): Promise<FuelReceiptView[]> {
    const driver = await this.driverVehicle.requireDriverForUser(userId);
    const rows = await this.prisma.fleetFuelEntry.findMany({
      where: { driverId: driver.id, receiptStoredPath: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      select: RECEIPT_SELECT,
    });
    return rows.map((row) => this.toView(row));
  }

  /**
   * Surucu fisi dogrular -> `submitted`.
   *
   * IDEMPOTENT: zaten `submitted` ise ayni kayit doner, ikinci bildirim
   * URETILMEZ. Cevrimdisi kuyruk ayni dokunusu tekrar gonderebilir.
   */
  async confirm(
    userId: string,
    receiptId: string,
    dto: ConfirmFuelReceiptDto,
  ): Promise<{ receipt: FuelReceiptView; issues: FuelReceiptIssue[] }> {
    const owner = await this.resolveOwner(userId);

    const current = await this.prisma.fleetFuelEntry.findFirst({
      where: { id: receiptId, driverId: owner.driverId },
      select: RECEIPT_SELECT,
    });
    if (!current) {
      throw new NotFoundException({ code: 'fuel_receipt_not_found' });
    }

    if (current.workflowStatus === FuelEntryWorkflowStatus.submitted) {
      // Tekrarlanan confirm: yeni yazma yok, yeni bildirim yok.
      return { receipt: this.toView(current), issues: [] };
    }
    // `rejected` DUZENLENEBILIR (Faz 7): muhasebe duzeltme istedi, surucu AYNI
    // kayit uzerinde duzeltip yeniden gonderiyor. Yeni bir FleetFuelEntry
    // acmak, ayni yakit alimini iki kez muhasebelestirme riski uretirdi ve ret
    // gecmisini kaydin disinda birakirdi.
    //
    // `approved` IMMUTABLE terminal durum: raporlara girmis bir tutari surucu
    // sonradan degistirememeli.
    if (
      current.workflowStatus !== FuelEntryWorkflowStatus.driver_review &&
      current.workflowStatus !== FuelEntryWorkflowStatus.rejected
    ) {
      throw new ConflictException({ code: 'fuel_receipt_not_editable' });
    }

    const isResubmission = current.workflowStatus === FuelEntryWorkflowStatus.rejected;

    const receiptGross = dto.receiptGrossAmount ?? dto.fuelGrossAmount;
    const issues = validateFuelReceiptDraft({
      purchasedAt: dto.purchasedAt,
      liters: dto.liters,
      pricePerLiter: dto.pricePerLiter ?? null,
      fuelGrossAmount: dto.fuelGrossAmount,
      receiptGrossAmount: receiptGross,
      receiptNetAmount: dto.receiptNetAmount ?? null,
      receiptVatAmount: dto.receiptVatAmount ?? null,
      receiptVatRate: dto.receiptVatRate ?? null,
      currency: dto.currency,
      fuelProduct: dto.fuelProduct,
      odometerKm: dto.odometerKm ?? null,
    });

    if (hasBlockingIssue(issues)) {
      throw new BadRequestException({ code: 'fuel_receipt_invalid', issues });
    }

    // --- Yakit uyumlulugu ---
    const rows = await this.compatibility.listRowsForVehicle(owner.vehicleId);
    const compatible = compatibleProductsForStationFilter(rows);
    const mismatch = compatible.length > 0 && !compatible.includes(dto.fuelProduct);
    if (mismatch && !dto.acknowledgeFuelMismatch) {
      // Kayit YOK EDILMIYOR: surucu fisin dogru oldugunu acikca onaylarsa
      // gecebilir. Onay olmadan gecirmek de dogru degil — yanlis yakit
      // gercekten olduysa muhasebe bunu gormeli.
      throw new ConflictException({
        code: 'fuel_product_not_compatible',
        compatibleProducts: compatible,
      });
    }

    const now = new Date();
    const settled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.fleetFuelEntry.update({
        where: { id: current.id },
        data: {
          workflowStatus: FuelEntryWorkflowStatus.submitted,
          submittedAt: now,
          // Yeniden gonderim AYRICA isaretleniyor: muhasebe "bu kayit bir kez
          // geri gonderilmisti" bilgisini kuyrukta gormeli. Ret nedeni
          // BILINCLI olarak silinmiyor — surucu neyi duzelttigini, muhasebe de
          // neyi istedigini gormeye devam etsin.
          ...(isResubmission ? { resubmittedAt: now } : {}),
          enteredAt: new Date(dto.purchasedAt),
          stationName: dto.stationName ?? null,
          stationAddress: dto.stationAddress ?? null,
          receiptNumber: dto.receiptNumber ?? null,
          fuelProduct: dto.fuelProduct,
          liters: new Prisma.Decimal(dto.liters),
          pricePerLiter:
            dto.pricePerLiter != null ? new Prisma.Decimal(dto.pricePerLiter) : null,
          // ARACA YAZILAN maliyet = YAKIT satiri. Karma fiste genel toplami
          // buraya yazmak aracin yakit maliyetini sisirirdi.
          totalCost: new Prisma.Decimal(dto.fuelGrossAmount),
          receiptGrossAmount: new Prisma.Decimal(receiptGross),
          receiptNetAmount:
            dto.receiptNetAmount != null ? new Prisma.Decimal(dto.receiptNetAmount) : null,
          receiptVatAmount:
            dto.receiptVatAmount != null ? new Prisma.Decimal(dto.receiptVatAmount) : null,
          receiptVatRate:
            dto.receiptVatRate != null ? new Prisma.Decimal(dto.receiptVatRate) : null,
          currency: dto.currency.toUpperCase(),
          paymentMethod: dto.paymentMethod ?? null,
          odometerKm: dto.odometerKm != null ? new Prisma.Decimal(dto.odometerKm) : null,
          receiptPlateNumber: dto.receiptPlateNumber ?? null,
          isFullTank: dto.isFullTank ?? false,
          compatibilityMismatch: mismatch,
          compatibilityAcknowledgedAt: mismatch ? now : null,
          // Tekil indeksin tasiyicisi: bir niyete tek kesinlesmis fis.
          fuelingIntentSettledKey: current.fuelingIntentId,
        },
        select: RECEIPT_SELECT,
      });

      // Bagli niyet TAMAMLANIYOR. `COMPLETED` Faz 5'te tam bu an icin
      // ayrilmisti; yeni bir terminal durum eklemeye gerek yok.
      if (current.fuelingIntentId) {
        await tx.fuelingIntent.updateMany({
          where: { id: current.fuelingIntentId, status: FuelingIntentStatus.ACTIVE },
          data: {
            status: FuelingIntentStatus.COMPLETED,
            completedAt: now,
            // Tek aktif niyet kilidi BOSALTILIYOR; temizlenmezse surucu bir
            // daha yakit duragi secemezdi.
            activeDriverKey: null,
          },
        });
      }

      return updated;
    });

    await this.recordConfirmation(userId, settled, mismatch);

    return { receipt: this.toView(settled), issues };
  }

  /** Fis goruntusunun yetkili okunmasi. Ham yol istemciye hic verilmiyor. */
  async resolveFileForDriver(
    userId: string,
    receiptId: string,
  ): Promise<{ absolutePath: string; mimeType: string; fileName: string }> {
    const driver = await this.driverVehicle.requireDriverForUser(userId);
    const row = await this.prisma.fleetFuelEntry.findFirst({
      where: { id: receiptId, driverId: driver.id },
      select: RECEIPT_SELECT,
    });
    if (!row || !row.receiptStoredPath) {
      throw new NotFoundException({ code: 'fuel_receipt_not_found' });
    }
    return {
      absolutePath: this.absolutePathFor(row),
      mimeType: row.receiptMimeType ?? 'application/octet-stream',
      fileName: row.receiptOriginalName ?? 'beleg',
    };
  }

  private absolutePathFor(row: Pick<ReceiptRow, 'receiptStoredPath'>): string {
    // Depolanan yolun YALNIZCA son parcasi kullaniliyor: veritabanindan gelen
    // bir metnin dizin disina cikmasina izin verilmiyor.
    const stored = row.receiptStoredPath ?? '';
    const fileName = stored.split('/').pop() ?? '';
    return join(FUEL_RECEIPT_UPLOAD_ABSOLUTE_DIR, fileName);
  }

  private async requireOwnDraft(driverId: string, receiptId: string): Promise<ReceiptRow> {
    const row = await this.prisma.fleetFuelEntry.findFirst({
      where: { id: receiptId, driverId },
      select: RECEIPT_SELECT,
    });
    if (!row) {
      throw new NotFoundException({ code: 'fuel_receipt_not_found' });
    }
    return row;
  }

  private async recordConfirmation(
    userId: string,
    row: ReceiptRow,
    mismatch: boolean,
  ): Promise<void> {
    await this.audit.logAction({
      actorUserId: userId,
      action: 'fuel_receipt.confirmed',
      entityType: 'FleetFuelEntry',
      entityId: row.id,
      summary: `Tankbeleg bestätigt (${row.vehicle.plateNumber})`,
      metadata: this.auditMetadata(row),
    });

    if (mismatch) {
      // Istisna denetimde AYRI bir olay olarak gorunmeli: "surucu uyariya
      // ragmen gonderdi" bilgisi, kaydin kendisinden okunamaz.
      await this.audit.logAction({
        actorUserId: userId,
        action: 'fuel_receipt.fuel_mismatch_acknowledged',
        entityType: 'FleetFuelEntry',
        entityId: row.id,
        summary: `Kraftstoff weicht von der Fahrzeugfreigabe ab: ${row.fuelProduct ?? '—'}`,
        metadata: this.auditMetadata(row),
      });
    }

    if (row.fuelingIntentId) {
      await this.audit.logAction({
        actorUserId: userId,
        action: 'fuel_receipt.fueling_intent_completed',
        entityType: 'FuelingIntent',
        entityId: row.fuelingIntentId,
        summary: 'Tankstopp mit Beleg abgeschlossen',
        metadata: this.auditMetadata(row),
      });
    }

    this.operationalNotify.notifyOperationalUsersSafely({
      key: mismatch ? 'fuel_receipt_needs_review' : 'fuel_receipt_submitted',
      params: {
        plateNumber: row.vehicle.plateNumber,
        station: row.stationName ?? '—',
      },
      type: 'system',
      priority: mismatch ? 'medium' : 'low',
      relatedEntityType: 'FleetFuelEntry',
      relatedEntityId: row.id,
    });
  }

  /**
   * Denetim govdesi.
   *
   * FIS GORUNTUSU, OCR HAM METNI VE ODEME BILGISI BURAYA GIRMEZ. Odeme yontemi
   * bile disarida: "Firmenkarte" zararsiz gorunse de kart numarasi tasiyan bir
   * OCR ciktisinin denetim kaydina sizmasinin yolu tam olarak bu tur alanlardir.
   */
  private auditMetadata(row: ReceiptRow): Prisma.InputJsonValue {
    return {
      fuelEntryId: row.id,
      driverId: row.driverId,
      vehicleId: row.vehicleId,
      workflowStatus: row.workflowStatus,
      ocrStatus: row.ocrStatus,
      ocrProvider: row.ocrProvider,
      fuelingIntentId: row.fuelingIntentId,
      fuelProduct: row.fuelProduct,
      compatibilityMismatch: row.compatibilityMismatch,
      occurredAt: new Date().toISOString(),
    };
  }

  private toView(row: ReceiptRow): FuelReceiptView {
    return {
      id: row.id,
      workflowStatus: row.workflowStatus,
      effectiveAccountingStatus: effectiveAccountingStatus(
        row.workflowStatus,
        // `!= null`: iliski secilmemisse `undefined` gelir ve `!== null`
        // o durumda yanlislikla "ters kayit var" derdi.
        row.reversal != null,
      ),
      ocrStatus: row.ocrStatus,
      ocrDataMode: row.ocrDataMode,
      ocrErrorClass: row.ocrErrorClass,
      ocrExtraction: (row.ocrExtraction as NormalizedFuelReceiptExtraction | null) ?? null,
      vehicle: { id: row.vehicle.id, plateNumber: row.vehicle.plateNumber },
      fuelingIntentId: row.fuelingIntentId,
      // YETKILI indirme yolu — ham depolama yolu istemciye ASLA verilmiyor.
      fileDownloadPath: row.receiptStoredPath ? `/driver/fuel-receipts/${row.id}/file` : null,
      fileName: row.receiptOriginalName,
      mimeType: row.receiptMimeType,
      enteredAt: row.enteredAt.toISOString(),
      purchasedAt:
        row.workflowStatus === FuelEntryWorkflowStatus.driver_review
          ? null
          : row.enteredAt.toISOString(),
      stationName: row.stationName,
      stationAddress: row.stationAddress,
      receiptNumber: row.receiptNumber,
      fuelProduct: row.fuelProduct,
      liters: num(row.liters),
      pricePerLiter: num(row.pricePerLiter),
      fuelGrossAmount: num(row.totalCost),
      receiptGrossAmount: num(row.receiptGrossAmount),
      receiptNetAmount: num(row.receiptNetAmount),
      receiptVatAmount: num(row.receiptVatAmount),
      receiptVatRate: num(row.receiptVatRate),
      currency: row.currency,
      paymentMethod: row.paymentMethod,
      odometerKm: num(row.odometerKm),
      receiptPlateNumber: row.receiptPlateNumber,
      isFullTank: row.isFullTank,
      compatibilityMismatch: row.compatibilityMismatch,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason,
      rejectedAt: row.rejectedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
