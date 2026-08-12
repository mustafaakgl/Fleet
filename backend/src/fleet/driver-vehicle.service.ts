import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus } from '@prisma/client';
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
