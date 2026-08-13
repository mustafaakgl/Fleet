import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FuelingIntentStatus, Prisma, type FuelProductType } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { OperationalNotifyService } from '../../notifications/operational-notify.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DriverVehicleService } from '../driver-vehicle.service';
import { compatibleProductsForStationFilter } from './core/fuel-compatibility.util';
import { finiteOrNull, isSameSelection, resolveIntentExpiry } from './core/fueling-intent.util';
import type { SelectFuelingIntentDto } from './dto/select-fueling-intent.dto';
import { FuelSelectionContextService } from './fuel-selection-context.service';
import { VehicleFuelCompatibilityService } from './vehicle-fuel-compatibility.service';

/** Surucuye ve ofise donen gorunum. Decimal alanlar sayiya cevrilir. */
export interface FuelingIntentView {
  id: string;
  status: FuelingIntentStatus;
  driverId: string;
  vehicleId: string;
  vehiclePlateNumber: string | null;
  tourId: string | null;
  anchorTourStopId: string | null;
  station: {
    provider: string;
    providerStationId: string;
    name: string;
    brand: string | null;
    address: {
      street: string | null;
      houseNumber: string | null;
      postalCode: string | null;
      city: string | null;
    };
    latitude: number;
    longitude: number;
  };
  selectedFuelProduct: FuelProductType;
  /**
   * ARAMA ANINDAKI saglayici fiyati. Odenen fiyat DEGIL — arayuz bunu acikca
   * boyle etiketler ve fis akisi (Prompt 6) gercek tutari getirir.
   */
  quotedPricePerLitre: number | null;
  priceRetrievedAt: string | null;
  attribution: { label: string; url: string | null };
  plannedLitres: number | null;
  routeMode: string | null;
  extraDistanceKm: number | null;
  extraDurationMin: number | null;
  driveTimeToStationMin: number | null;
  /** Tahmini SURUS varisi; varis garantisi degil. */
  stationEta: string | null;
  routeCalculatedAt: string | null;
  selectedAt: string;
  navigationOpenedAt: string | null;
  expiresAt: string;
}

export interface SelectFuelingIntentResult {
  intent: FuelingIntentView;
  /** 'created' | 'replaced' | 'unchanged' — 'unchanged' bildirim URETMEZ. */
  outcome: 'created' | 'replaced' | 'unchanged';
  replacedIntentId: string | null;
}

/** Prisma satirindan gorunume; select listesi burada tek yerde. */
const INTENT_SELECT = {
  id: true,
  status: true,
  driverId: true,
  vehicleId: true,
  tourId: true,
  anchorTourStopId: true,
  provider: true,
  providerStationId: true,
  stationName: true,
  stationBrand: true,
  stationStreet: true,
  stationHouseNumber: true,
  stationPostalCode: true,
  stationCity: true,
  stationLatitude: true,
  stationLongitude: true,
  selectedFuelProduct: true,
  quotedPricePerLitre: true,
  priceRetrievedAt: true,
  attributionLabel: true,
  attributionUrl: true,
  plannedLitres: true,
  routeMode: true,
  extraDistanceKm: true,
  extraDurationMin: true,
  driveTimeToStationMin: true,
  stationEta: true,
  routeCalculatedAt: true,
  selectedAt: true,
  navigationOpenedAt: true,
  expiresAt: true,
  vehicle: { select: { plateNumber: true } },
} satisfies Prisma.FuelingIntentSelect;

type IntentRow = Prisma.FuelingIntentGetPayload<{ select: typeof INTENT_SELECT }>;

function toNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

/** Fiyat icin: 0 ve negatif "fiyat yok" demektir, "bedava" degil. */
function positiveOrNull(value: number | null): number | null {
  const finite = finiteOrNull(value);
  return finite !== null && finite > 0 ? finite : null;
}

export function toFuelingIntentView(row: IntentRow): FuelingIntentView {
  return {
    id: row.id,
    status: row.status,
    driverId: row.driverId,
    vehicleId: row.vehicleId,
    vehiclePlateNumber: row.vehicle?.plateNumber ?? null,
    tourId: row.tourId,
    anchorTourStopId: row.anchorTourStopId,
    station: {
      provider: row.provider,
      providerStationId: row.providerStationId,
      name: row.stationName,
      brand: row.stationBrand,
      address: {
        street: row.stationStreet,
        houseNumber: row.stationHouseNumber,
        postalCode: row.stationPostalCode,
        city: row.stationCity,
      },
      latitude: Number(row.stationLatitude),
      longitude: Number(row.stationLongitude),
    },
    selectedFuelProduct: row.selectedFuelProduct,
    quotedPricePerLitre: toNumber(row.quotedPricePerLitre),
    priceRetrievedAt: row.priceRetrievedAt?.toISOString() ?? null,
    attribution: { label: row.attributionLabel, url: row.attributionUrl },
    plannedLitres: toNumber(row.plannedLitres),
    routeMode: row.routeMode,
    extraDistanceKm: toNumber(row.extraDistanceKm),
    extraDurationMin: toNumber(row.extraDurationMin),
    driveTimeToStationMin: toNumber(row.driveTimeToStationMin),
    stationEta: row.stationEta?.toISOString() ?? null,
    routeCalculatedAt: row.routeCalculatedAt?.toISOString() ?? null,
    selectedAt: row.selectedAt.toISOString(),
    navigationOpenedAt: row.navigationOpenedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

/**
 * Gecici yakit duraginin yasam dongusu.
 *
 * TUR VERISINE HIC DOKUNMAZ: bu servis Tour ya da TourStop uzerinde tek bir
 * yazma yapmaz. Yakit duragi musteri duraklarinin sirasina girmez, tur
 * optimizasyonunu tetiklemez ve `optimizedRoute`/status/version alanlarini
 * degistirmez — dogrulamasi fueling-intent.spec.ts'te.
 *
 * "Bir surucunun ayni anda tek aktif niyeti" kurali IKI KATMANDA:
 *   1. transaction icinde oku-yaz (mantiksal tutarlilik)
 *   2. (tenantId, activeDriverKey) tekil indeksi (gercek yaris korumasi)
 * Ikincisi olmadan iki es zamanli istek ikisi de "aktif yok" gorup iki kayit
 * yaratirdi; birincisi olmadan eski kaydin SUPERSEDED olmasiyla yenisinin
 * dogmasi arasinda "aktif niyeti olmayan" bir pencere kalirdi.
 */
@Injectable()
export class FuelingIntentService {
  private readonly logger = new Logger(FuelingIntentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly driverVehicle: DriverVehicleService,
    private readonly compatibility: VehicleFuelCompatibilityService,
    private readonly selectionContexts: FuelSelectionContextService,
    private readonly audit: AuditService,
    private readonly operationalNotify: OperationalNotifyService,
  ) {}

  /**
   * Suresi gecmis aktif kayitlari kapatir — TEMBEL sure sonu.
   *
   * Cron YOK: aktif niyet zaten yalnizca surucu ya da ofis ona baktiginda
   * anlam tasir; her okumada kapatmak, ayri bir zamanlanmis is ve onun
   * izlenmesi kadar guvenilir ve cok daha ucuz. `activeDriverKey` TEMIZLENIR,
   * aksi halde tekil indeks surucunun yeni secim yapmasini engellerdi.
   */
  private async expireStale(
    tx: Prisma.TransactionClient,
    driverId: string,
    now: Date,
  ): Promise<void> {
    await tx.fuelingIntent.updateMany({
      where: { driverId, status: FuelingIntentStatus.ACTIVE, expiresAt: { lte: now } },
      data: { status: FuelingIntentStatus.EXPIRED, activeDriverKey: null },
    });
  }

  private findActive(tx: Prisma.TransactionClient, driverId: string) {
    return tx.fuelingIntent.findFirst({
      where: { driverId, status: FuelingIntentStatus.ACTIVE },
      select: INTENT_SELECT,
    });
  }

  /** Oturumdaki kullanicidan surucu + BUGUNKU ARAC. Istemci hicbirini secemez. */
  private async resolveOwner(userId: string): Promise<{ driverId: string; vehicleId: string }> {
    const driver = await this.driverVehicle.requireDriverForUser(userId);
    const vehicle = await this.driverVehicle.resolveTodayVehicle(driver.id);
    if (!vehicle) {
      throw new ConflictException({ code: 'driver_vehicle_not_resolved' });
    }
    return { driverId: driver.id, vehicleId: vehicle.id };
  }

  /**
   * Surucunun aktif yakit duragi.
   *
   * Aktif kayit olmamasi NORMAL bir durumdur, hata degil: `intent: null`.
   * Baska bir surucunun kaydi bu sorgudan CIKAMAZ — `driverId` oturumdan
   * cozuluyor ve kiraci filtresi Prisma katmaninda zaten uygulaniyor.
   */
  async getActive(userId: string): Promise<{ intent: FuelingIntentView | null }> {
    const driver = await this.driverVehicle.requireDriverForUser(userId);
    const now = new Date();

    const row = await this.prisma.$transaction(async (tx) => {
      await this.expireStale(tx, driver.id, now);
      return this.findActive(tx, driver.id);
    });

    return { intent: row ? toFuelingIntentView(row) : null };
  }

  /**
   * Ofis gorunumu: bu turla ilgili aktif yakit duragi.
   *
   * Iki kaynak birlestiriliyor cunku surucu yakit duragini turdan BAGIMSIZ da
   * secebilir (rota hesaplanamamis, tur belirsiz): tura bagli kayit yoksa ayni
   * surucu ve ayni arac icin bagimsiz aktif kayit gosteriliyor. Aksi halde
   * planlamaci "surucu bir yere sapiyor" bilgisini hic gormezdi.
   *
   * Suresi gecmis kayit YAZILMADAN filtreleniyor: ofisin bir kaydi OKUMASI,
   * surucunun verisini degistirmemeli. Gercek kapatma surucu tarafindaki
   * tembel sure sonunda oluyor.
   */
  async findActiveForTour(tour: {
    id: string;
    driverId: string | null;
    vehicleId: string | null;
  }): Promise<FuelingIntentView | null> {
    const now = new Date();
    const alternatives: Prisma.FuelingIntentWhereInput[] = [{ tourId: tour.id }];

    if (tour.driverId) {
      alternatives.push({
        tourId: null,
        driverId: tour.driverId,
        ...(tour.vehicleId ? { vehicleId: tour.vehicleId } : {}),
      });
    }

    const row = await this.prisma.fuelingIntent.findFirst({
      where: {
        status: FuelingIntentStatus.ACTIVE,
        expiresAt: { gt: now },
        OR: alternatives,
      },
      // Tura bagli kayit once: bagimsiz kayit yalnizca yedek.
      orderBy: [{ tourId: 'desc' }, { selectedAt: 'desc' }],
      select: INTENT_SELECT,
    });

    return row ? toFuelingIntentView(row) : null;
  }

  async select(userId: string, dto: SelectFuelingIntentDto): Promise<SelectFuelingIntentResult> {
    const owner = await this.resolveOwner(userId);

    const lookup = await this.selectionContexts.resolve(dto.selectionContextId, owner);
    if (!lookup.ok) {
      // Sure doldu ya da baglam bu surucuye/araca ait degil. Saglayici verisi
      // UYDURULMAZ ve eski fiyat sessizce kullanilmaz — surucu yeniden arar.
      throw new ConflictException({ code: 'fueling_selection_context_expired' });
    }
    const context = lookup.context;

    const station = context.stations.find((entry) => entry.id === dto.stationId);
    if (!station) {
      // Istemci baglamda OLMAYAN bir istasyon kimligi gonderdi: uydurma bir
      // istasyon kaydedilemez.
      throw new ConflictException({ code: 'fueling_station_not_in_context' });
    }

    // Uyumluluk CANLI okunuyor, baglamdaki kopyadan degil: ofis arama ile secim
    // arasinda bir urunun onayini kaldirmis olabilir ve 10 dakikalik bir
    // snapshot'a dayanarak yanlis yakiti onaylamak yakit hasari demektir.
    const rows = await this.compatibility.listRowsForVehicle(owner.vehicleId);
    const compatibleProducts = compatibleProductsForStationFilter(rows);
    if (!compatibleProducts.includes(dto.selectedFuelProduct)) {
      throw new ConflictException({ code: 'fuel_product_not_compatible' });
    }

    const offering = station.offerings.find(
      (entry) => entry.productType === dto.selectedFuelProduct,
    );
    if (!offering) {
      throw new ConflictException({ code: 'fuel_product_not_offered' });
    }

    const tourLink = await this.resolveTourLink(owner.driverId, context);
    const now = new Date();
    const plannedLitres = dto.plannedLitres ?? null;

    const data: Prisma.FuelingIntentUncheckedCreateInput = {
      driverId: owner.driverId,
      vehicleId: owner.vehicleId,
      tourId: tourLink.tourId,
      anchorTourStopId: tourLink.anchorTourStopId,
      status: FuelingIntentStatus.ACTIVE,
      activeDriverKey: owner.driverId,
      provider: station.provider,
      providerStationId: station.id,
      stationName: station.name,
      stationBrand: station.brand,
      stationStreet: station.address.street,
      stationHouseNumber: station.address.houseNumber,
      stationPostalCode: station.address.postalCode,
      stationCity: station.address.city,
      stationLatitude: new Prisma.Decimal(station.latitude),
      stationLongitude: new Prisma.Decimal(station.longitude),
      selectedFuelProduct: dto.selectedFuelProduct,
      // Fiyat yoksa ya da anlamsizsa (0/negatif/NaN) null: "0 EUR" diye bir
      // yakit fiyati yok ve sifir, sonraki karsilastirmayi bozardi.
      quotedPricePerLitre: this.decimalOrNull(positiveOrNull(offering.pricePerUnit)),
      priceRetrievedAt: this.dateOrNull(station.retrievedAt),
      attributionLabel: context.attribution.label,
      attributionUrl: context.attribution.url,
      plannedLitres: this.decimalOrNull(plannedLitres),
      routeMode: context.routeMode,
      extraDistanceKm: this.decimalOrNull(station.routeMetrics?.extraDistanceKm ?? null),
      extraDurationMin: this.decimalOrNull(station.routeMetrics?.extraDurationMin ?? null),
      driveTimeToStationMin: this.decimalOrNull(
        station.routeMetrics?.driveTimeToStationMin ?? null,
      ),
      stationEta: this.dateOrNull(station.routeMetrics?.stationEta ?? null),
      routeCalculatedAt: this.dateOrNull(context.routeCalculatedAt),
      selectedAt: now,
      expiresAt: resolveIntentExpiry({ selectedAt: now, tourWorkDate: tourLink.workDate }),
    };

    const selectionKey = {
      provider: station.provider,
      providerStationId: station.id,
      selectedFuelProduct: dto.selectedFuelProduct,
      plannedLitres,
    };

    const result = await this.applySelection(owner.driverId, data, selectionKey, now);

    if (result.outcome !== 'unchanged') {
      await this.recordSelection(userId, result);
    }

    return result;
  }

  /**
   * Yazma adimi — tekil indeks ihlalinde BIR KEZ yeniden deniyor.
   *
   * Ihlal tek bir anlama gelir: ayni surucu icin es zamanli ikinci bir secim
   * arada kazandi. Yeniden denemede o kayit artik gorulur ve normal yol
   * isler — ayni secimse ikinci kayit URETILMEZ, farkliysa duzgunce
   * SUPERSEDED olur. Iki denemede de kaybedersek uydurmaya calismiyoruz:
   * cakisma bildiriliyor.
   */
  private async applySelection(
    driverId: string,
    data: Prisma.FuelingIntentUncheckedCreateInput,
    selectionKey: {
      provider: string;
      providerStationId: string;
      selectedFuelProduct: FuelProductType;
      plannedLitres: number | null;
    },
    now: Date,
  ): Promise<SelectFuelingIntentResult> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await this.expireStale(tx, driverId, now);
          const current = await this.findActive(tx, driverId);

          if (current) {
            const currentKey = {
              provider: current.provider,
              providerStationId: current.providerStationId,
              selectedFuelProduct: current.selectedFuelProduct,
              plannedLitres: toNumber(current.plannedLitres),
            };
            if (isSameSelection(currentKey, selectionKey)) {
              // Cift dokunus / cevrimdisi tekrar gonderimi: yeni kayit YOK,
              // yeni bildirim YOK. Sonuc ayni kayit.
              return {
                intent: toFuelingIntentView(current),
                outcome: 'unchanged' as const,
                replacedIntentId: null,
              };
            }

            await tx.fuelingIntent.update({
              where: { id: current.id },
              data: {
                status: FuelingIntentStatus.SUPERSEDED,
                supersededAt: now,
                // Tekil indeksin serbest kalmasi icin ZORUNLU.
                activeDriverKey: null,
              },
            });
          }

          const created = await tx.fuelingIntent.create({ data, select: INTENT_SELECT });
          return {
            intent: toFuelingIntentView(created),
            outcome: (current ? 'replaced' : 'created') as 'created' | 'replaced',
            replacedIntentId: current?.id ?? null,
          };
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt === 0
        ) {
          this.logger.warn(
            `Concurrent fueling intent for driver ${driverId} — retrying once`,
          );
          continue;
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException({ code: 'fueling_intent_conflict' });
        }
        throw error;
      }
    }

    throw new ConflictException({ code: 'fueling_intent_conflict' });
  }

  /**
   * Iptal — TEKRARLANABILIR.
   *
   * Aktif kayit yoksa hata DEGIL: surucu ekrani yenilerken ya da cevrimdisi
   * kuyruk ayni dokunusu tekrar gonderirken ikinci iptal normaldir. `cancelled`
   * alani cagirana gercekten bir sey kapatilip kapatilmadigini soyler; bildirim
   * yalnizca ilkinde uretilir.
   */
  async cancel(userId: string): Promise<{ intent: null; cancelled: boolean }> {
    const driver = await this.driverVehicle.requireDriverForUser(userId);
    const now = new Date();

    const cancelledRow = await this.prisma.$transaction(async (tx) => {
      await this.expireStale(tx, driver.id, now);
      const current = await this.findActive(tx, driver.id);
      if (!current) {
        return null;
      }

      await tx.fuelingIntent.update({
        where: { id: current.id },
        data: {
          status: FuelingIntentStatus.CANCELLED,
          cancelledAt: now,
          activeDriverKey: null,
        },
      });
      return current;
    });

    if (cancelledRow) {
      const view = toFuelingIntentView(cancelledRow);
      await this.audit.logAction({
        actorUserId: userId,
        action: 'fueling_intent.cancelled',
        entityType: 'FuelingIntent',
        entityId: view.id,
        summary: `Tankstopp storniert: ${view.station.name}`,
        metadata: this.auditMetadata(view, null),
      });
      this.operationalNotify.notifyOperationalUsersSafely({
        key: 'fueling_stop_cancelled',
        params: {
          station: view.station.name,
          plateNumber: view.vehiclePlateNumber ?? '—',
        },
        type: 'system',
        priority: 'low',
        relatedEntityType: 'FuelingIntent',
        relatedEntityId: view.id,
      });
    }

    return { intent: null, cancelled: Boolean(cancelledRow) };
  }

  /**
   * Harici navigasyonun acildigi an.
   *
   * VARIS YA DA YAKIT ALMA KANITI DEGIL — yalnizca "surucu yol tarifini acti".
   * ILK acilis korunuyor: ikinci dokunus zamani ezmez, cunku ilgilendigimiz
   * sey surucunun ne zaman yola ciktigidir. Tekrar sayisi gerekirse denetim
   * kaydindan okunur.
   *
   * Bu uc BASARISIZ OLSA BILE arayuz navigasyonu acmaya devam eder (bkz.
   * DriverFuelingIntentCard): telemetri, isin kendisini engellememeli.
   */
  async markNavigationOpened(userId: string): Promise<{ intent: FuelingIntentView }> {
    const driver = await this.driverVehicle.requireDriverForUser(userId);
    const now = new Date();

    const row = await this.prisma.$transaction(async (tx) => {
      await this.expireStale(tx, driver.id, now);
      const current = await this.findActive(tx, driver.id);
      if (!current) {
        return null;
      }
      if (current.navigationOpenedAt) {
        return current;
      }
      return tx.fuelingIntent.update({
        where: { id: current.id },
        data: { navigationOpenedAt: now },
        select: INTENT_SELECT,
      });
    });

    if (!row) {
      throw new NotFoundException({ code: 'active_fueling_intent_not_found' });
    }

    const view = toFuelingIntentView(row);
    // Ofis bildirimi YOK: navigasyon acmak operasyonel bir olay degil.
    // Denetim izi yeterli.
    await this.audit.logAction({
      actorUserId: userId,
      action: 'fueling_intent.navigation_opened',
      entityType: 'FuelingIntent',
      entityId: view.id,
      summary: `Navigation geöffnet: ${view.station.name}`,
      metadata: this.auditMetadata(view, null),
    });

    return { intent: view };
  }

  /**
   * Baglamdan gelen tur bagini DOGRULAR.
   *
   * Baglam sunucu tarafinda uretildigi icin zaten guvenilir; buradaki sorgu
   * arama ile secim arasinda turun silinmis/baska surucuye gecmis olmasina
   * karsi. Eslesme yoksa bag sessizce dusuruluyor — secim yine gecerlidir,
   * yalnizca turdan bagimsiz olur.
   */
  private async resolveTourLink(
    driverId: string,
    context: { tourId: string | null; anchorTourStopId: string | null },
  ): Promise<{ tourId: string | null; anchorTourStopId: string | null; workDate: Date | null }> {
    if (!context.tourId) {
      return { tourId: null, anchorTourStopId: null, workDate: null };
    }

    const anchorId = context.anchorTourStopId;
    const tour = await this.prisma.tour.findFirst({
      where: { id: context.tourId, driverId },
      select: {
        id: true,
        workDate: true,
        // Cipa YALNIZCA bu turun bir duragi olabilir. Baska bir turun durak
        // kimligiyle baglanmasi, ofiste yakit duragini yanlis turun altinda
        // gosterirdi.
        ...(anchorId
          ? { stops: { where: { id: anchorId }, select: { id: true } } }
          : {}),
      },
    });

    if (!tour) {
      return { tourId: null, anchorTourStopId: null, workDate: null };
    }

    return {
      tourId: tour.id,
      anchorTourStopId: 'stops' in tour ? (tour.stops[0]?.id ?? null) : null,
      workDate: tour.workDate,
    };
  }

  private async recordSelection(
    userId: string,
    result: SelectFuelingIntentResult,
  ): Promise<void> {
    const view = result.intent;
    const replaced = result.outcome === 'replaced';

    await this.audit.logAction({
      actorUserId: userId,
      action: replaced ? 'fueling_intent.changed' : 'fueling_intent.selected',
      entityType: 'FuelingIntent',
      entityId: view.id,
      summary: `Tankstopp ${replaced ? 'geändert' : 'gewählt'}: ${view.station.name}`,
      metadata: this.auditMetadata(view, result.replacedIntentId),
    });

    this.operationalNotify.notifyOperationalUsersSafely({
      key: replaced ? 'fueling_stop_changed' : 'fueling_stop_selected',
      params: {
        station: view.station.name,
        plateNumber: view.vehiclePlateNumber ?? '—',
      },
      type: 'system',
      priority: 'low',
      relatedEntityType: 'FuelingIntent',
      relatedEntityId: view.id,
    });
  }

  /**
   * Denetim kaydinin govdesi.
   *
   * SURUCUNUN BASLANGIC KONUMU BILINCLI OLARAK YOK: denetim izi bir konum
   * gecmisi degildir ve istasyon koordinati zaten kaydin kendisinde duruyor.
   */
  private auditMetadata(
    view: FuelingIntentView,
    previousIntentId: string | null,
  ): Prisma.InputJsonValue {
    return {
      fuelingIntentId: view.id,
      previousFuelingIntentId: previousIntentId,
      driverId: view.driverId,
      vehicleId: view.vehicleId,
      tourId: view.tourId,
      provider: view.station.provider,
      providerStationId: view.station.providerStationId,
      stationName: view.station.name,
      selectedFuelProduct: view.selectedFuelProduct,
      routeMode: view.routeMode,
      occurredAt: new Date().toISOString(),
    };
  }

  private decimalOrNull(value: number | null): Prisma.Decimal | null {
    return value === null ? null : new Prisma.Decimal(value);
  }

  private dateOrNull(value: string | null): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
