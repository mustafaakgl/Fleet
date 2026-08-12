import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, TourStopStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bir gorevin araci "surucunun bugunku araci" saymaya yeten durumlari.
 * Iptal ve tamamlanmis gorevler haric — bkz. FleetFuelService'in eski kopyasi.
 */
const TRACKABLE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.planned,
  AssignmentStatus.confirmed,
  AssignmentStatus.in_progress,
];

/** Sürücüye gösterilen turlar; taslak tur henuz dispatcher onayinda. */
const DRIVER_VISIBLE_TOUR_STATUSES = ['optimized', 'released', 'in_progress'] as const;

export interface ResolvedDriverVehicle {
  id: string;
  plateNumber: string;
  /** Aracin hangi kayittan cozuldugu — tanilama ve denetim icin. */
  source: 'tour' | 'assignment' | 'current_driver';
}

/**
 * Surucunun aktif turu ve SIRADAKI tamamlanmamis duragi.
 *
 * `routeVersion` turun o anki surumu (updatedAt): rota sapmasi onbellegi buna
 * baglanir, boylece dispatcher turu degistirdiginde eski sapma yeniden
 * kullanilmaz.
 */
export interface ResolvedActiveTourStop {
  tourId: string;
  routeVersion: string;
  /** Tur bulundu ama koordinatli tamamlanmamis durak yoksa null. */
  nextStop: {
    id: string;
    sequence: number;
    label: string;
    latitude: number;
    longitude: number;
  } | null;
  /** Tur var, tamamlanmamis durak var ama koordinati yok. */
  nextStopLocationMissing: boolean;
  /**
   * Ilk tamamlanmamis durak `arrived` ise onun GUVENLI ozeti.
   *
   * Koordinat BILINCLI olarak yok: bu durak bir rota hedefi degil. Surucu
   * zaten orada duruyor ve "mevcut konum -> istasyon -> zaten bulundugum
   * durak" hesabi gercek hayatta anlamsiz bir oneri uretir. Yalnizca
   * kullaniciya "hangi durakta oldugunu" gostermek icin.
   */
  currentStopInService: {
    id: string;
    sequence: number;
    label: string;
  } | null;
}

/**
 * Ayni gun icinde birden fazla tur guvenilir sekilde ayirt edilemedi.
 *
 * Rastgele tur secmek yerine bu durum bildirilir; cagiran taraf rota
 * metrigi olmadan yakinlik davranisina duser.
 */
export interface AmbiguousActiveTour {
  ambiguous: true;
  /** Tanilama icin: cakisan turlarin kimlikleri. */
  tourIds: string[];
}

export type ActiveTourResolution = ResolvedActiveTourStop | AmbiguousActiveTour | null;

export function isAmbiguousActiveTour(
  resolution: ActiveTourResolution,
): resolution is AmbiguousActiveTour {
  return resolution !== null && 'ambiguous' in resolution;
}

/**
 * Tur durumu onceligi: surulmekte olan tur, yayinlanmis turdan; yayinlanmis
 * tur da yalnizca optimize edilmis turdan ONCE gelir.
 *
 * Dizi sirasi onceligi TANIMLAR — indeks kucukse oncelik yuksek.
 */
const TOUR_STATUS_PRIORITY = ['in_progress', 'released', 'optimized'] as const;

/**
 * "Bu surucu bugun hangi aracta?" sorusunun TEK yeri.
 *
 * Neden ayri servis: `assertDriverAssignedToVehicle` bu commit'ten once
 * FleetFuelService, FleetTripsService ve FleetVehicleStatusService icinde
 * BIREBIR AYNI sekilde uc kez duruyordu. Dorduncu bir kopya yazmak yerine
 * ucu de buraya baglandi; kural degistiginde (ornegin tur bazli atama) tek
 * yerde degisir.
 *
 * Cozumleme ile DOGRULAMA ayri tutuluyor:
 *   - resolveTodayVehicle: "hangi arac?" (surucu arac secemedigi uclar icin)
 *   - assertDriverAssignedToVehicle: "bu arac onun mu?" (arac id'si disaridan
 *     geldiginde)
 */
@Injectable()
export class DriverVehicleService {
  constructor(private readonly prisma: PrismaService) {}

  /** Yerel gunun [00:00, +1 gun) araligi. */
  todayRange(): { start: Date; end: Date } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  /** Kullaniciya bagli surucu profili. */
  async requireDriverForUser(userId: string): Promise<{ id: string }> {
    const driver = await this.prisma.driver.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!driver) {
      throw new ForbiddenException({ code: 'driver_profile_not_found' });
    }
    return driver;
  }

  /**
   * Surucunun bugunku araci — SUNUCU TARAFINDA.
   *
   * Sira, isletme gercekligine gore: gunun turu en somut atamadir (dispatcher
   * araci turla birlikte veriyor), tur yoksa gunun gorevi, o da yoksa aracin
   * ustundeki kalici surucu kaydi. Hicbiri yoksa null — tahmin yok, "filodaki
   * ilk arac" gibi bir varsayilan YOK.
   *
   * Sorgular tenant kapsamli istemciyle yapiliyor: baska kiracinin turu ya da
   * gorevi bu cozumlemeye giremez.
   */
  async resolveTodayVehicle(driverId: string): Promise<ResolvedDriverVehicle | null> {
    const { start, end } = this.todayRange();

    const tour = await this.prisma.tour.findFirst({
      where: {
        driverId,
        workDate: { gte: start, lt: end },
        status: { in: [...DRIVER_VISIBLE_TOUR_STATUSES] },
        vehicleId: { not: null },
      },
      orderBy: { workDate: 'asc' },
      select: { vehicle: { select: { id: true, plateNumber: true } } },
    });
    if (tour?.vehicle) {
      return { ...tour.vehicle, source: 'tour' };
    }

    const assignment = await this.prisma.assignment.findFirst({
      where: {
        driverId,
        workDate: { gte: start, lt: end },
        status: { in: TRACKABLE_ASSIGNMENT_STATUSES },
      },
      orderBy: { startTime: 'asc' },
      select: { vehicle: { select: { id: true, plateNumber: true } } },
    });
    if (assignment?.vehicle) {
      return { ...assignment.vehicle, source: 'assignment' };
    }

    const currentVehicle = await this.prisma.vehicle.findFirst({
      where: { currentDriverId: driverId, status: 'active' },
      select: { id: true, plateNumber: true },
    });
    if (currentVehicle) {
      return { ...currentVehicle, source: 'current_driver' };
    }

    return null;
  }

  /**
   * Surucunun aktif turu ve siradaki tamamlanmamis duragi — SUNUCU TARAFINDA.
   *
   * Tur durumlari DRIVER_VISIBLE_TOUR_STATUSES ile ayni: surucunun tur
   * ekraninda gordugu tur, sapma hesabinda da esas alinan turdur (bkz.
   * tour-driver.controller). Taslak tur burada da yok.
   *
   * SIRA DEGISTIRILMEZ: duraklar `sequence` artan sirada okunuyor ve ilk
   * gecerli tamamlanmamis durak siradaki durak sayiliyor. Yeniden optimizasyon
   * ya da yeniden siralama YOK — bu faz yalnizca hesaplama yapiyor.
   *
   * Tamamlanmis (`completed`) ve atlanmis (`skipped`) duraklar disarida. Bu
   * repoda TourStopStatus'te `cancelled` YOK; iptalin karsiligi `skipped`.
   *
   * Sorgular tenant kapsamli istemciyle: baska kiracinin turu cozumlemeye
   * giremez.
   */
  async resolveActiveTourNextStop(driverId: string): Promise<ActiveTourResolution> {
    const { start, end } = this.todayRange();

    // TUM adaylar cekiliyor, `findFirst` ile bir tanesi DEGIL.
    //
    // Neden: findFirst'in orderBy'i workDate'ti ve workDate zaten bugune
    // kisitli oldugu icin ayni gundeki iki tur arasinda siralama YOKTU —
    // secim Prisma'nin dondurdugu dogal siraya kaliyordu. Surucu her
    // yenilemede baska turun sapmasini gorebilirdi.
    //
    // Siralama repodaki canonical kurallar: workDate artan (surucu tur ucu,
    // tour-driver.controller) ve createdAt azalan (ofis tur listesi,
    // tour.controller). Son olarak id ile kararli tie-break.
    const candidates = await this.prisma.tour.findMany({
      where: {
        driverId,
        workDate: { gte: start, lt: end },
        status: { in: [...DRIVER_VISIBLE_TOUR_STATUSES] },
      },
      orderBy: [{ workDate: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        status: true,
        updatedAt: true,
        stops: {
          where: { status: { notIn: [TourStopStatus.completed, TourStopStatus.skipped] } },
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            sequence: true,
            kind: true,
            status: true,
            location: {
              select: { latitude: true, longitude: true, city: true, street: true, rawAddress: true },
            },
          },
        },
      },
    });

    if (candidates.length === 0) {
      return null;
    }

    // En yuksek onceligi tasiyan durum secilir: in_progress > released > optimized.
    const topPriority = Math.min(
      ...candidates.map((candidate) =>
        TOUR_STATUS_PRIORITY.indexOf(candidate.status as (typeof TOUR_STATUS_PRIORITY)[number]),
      ),
    );
    const topStatus = TOUR_STATUS_PRIORITY[topPriority];
    const topCandidates = candidates.filter((candidate) => candidate.status === topStatus);

    // AYNI ANDA iki `in_progress` tur fiziksel olarak imkansiz — bir surucu iki
    // turu birlikte suremez. Bu bir veri anomalisidir ve teknik olarak
    // deterministik secilebilse bile IS ANLAMINDA keyfi olurdu; bu yuzden
    // rastgele secmek yerine belirsizlik bildiriliyor.
    //
    // released/optimized icin birden fazla tur normaldir (bolunmus vardiya):
    // surucu bunlari sirayla yapar, en erken olan aktif olandir ve yukaridaki
    // deterministik siralama onu secer.
    if (topStatus === 'in_progress' && topCandidates.length > 1) {
      return { ambiguous: true, tourIds: topCandidates.map((candidate) => candidate.id) };
    }

    const tour = topCandidates[0]!;
    const routeVersion = tour.updatedAt.toISOString();
    const base = { tourId: tour.id, routeVersion, currentStopInService: null };

    if (tour.stops.length === 0) {
      return { ...base, nextStop: null, nextStopLocationMissing: false };
    }

    const first = tour.stops[0]!;
    const label =
      first.location.street?.trim() ||
      first.location.city?.trim() ||
      first.location.rawAddress?.trim() ||
      first.kind;

    // Ilk tamamlanmamis durak `arrived` ise surucu ZATEN ORADA.
    //
    // Bu duraga rota kurmak ("konum -> istasyon -> bulundugum durak") anlamsiz
    // bir oneri uretir. Onu ATLAYIP sonraki pending duraga gecmek de yanlis
    // olurdu: bu, surucunun mevcut hizmeti bitirdigini VARSAYMAK olur. Durak
    // completed/skipped isaretlendikten sonraki sorguda sonraki pending durak
    // normal sekilde cozulecek.
    if (first.status === TourStopStatus.arrived) {
      return {
        ...base,
        nextStop: null,
        nextStopLocationMissing: false,
        currentStopInService: { id: first.id, sequence: first.sequence, label },
      };
    }

    // Koordinati olmayan durak SESSIZCE atlanmiyor ve yanlis koordinatla
    // hesaplanmiyor: ilk tamamlanmamis duragin koordinati yoksa sapma
    // hesaplanamaz ve bu durum ayrica bildirilir.
    if (first.location.latitude === null || first.location.longitude === null) {
      return { ...base, nextStop: null, nextStopLocationMissing: true };
    }

    return {
      ...base,
      nextStop: {
        id: first.id,
        sequence: first.sequence,
        label,
        latitude: Number(first.location.latitude),
        longitude: Number(first.location.longitude),
      },
      nextStopLocationMissing: false,
    };
  }

  /**
   * Disaridan gelen bir arac id'sinin gercekten bu surucunun bugunku araci
   * oldugunu dogrular.
   *
   * Davranis, cikarildigi uc kopyayla AYNI tutuldu (arac yok -> 404, baskasinin
   * araci -> 403); cagiran servislerin sozlesmesi degismedi.
   */
  async assertDriverAssignedToVehicle(driverId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId },
      select: { id: true, currentDriverId: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.currentDriverId === driverId) {
      return;
    }

    const { start, end } = this.todayRange();
    const assignments = await this.prisma.assignment.findMany({
      where: {
        driverId,
        vehicleId,
        workDate: { gte: start, lt: end },
        status: { in: TRACKABLE_ASSIGNMENT_STATUSES },
      },
      select: { id: true },
      take: 1,
    });

    if (assignments.length === 0) {
      throw new ForbiddenException('Driver is not assigned to this vehicle today');
    }
  }
}
