import { Injectable, Logger } from '@nestjs/common';
import { FleetTripStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  type DeviationResult,
  computeDeviation,
  isSuspicious,
  sumDeviations,
} from './core/route-deviation.util';
import { DEFAULT_TRUCK_PROFILE } from './core/routing.types';
import { RoutingService } from './routing.service';

/**
 * Rapor satiri ARAC-GUN duzeyinde.
 *
 * Gorev duzeyinde olmamasinin sebebi olcume dayali: bir surucu gunde birkac
 * gorev yaptiginda tek bir kesintisiz rota suruyor ve GPS seferleri goreve
 * degil araca/gune bagli olusuyor (olculdu: 3411 seferin hicbirinde
 * assignmentId dolu degil). Kilometreyi gorev basina bolmek kurgu olurdu;
 * arac-gun ikisini de dogru toplar.
 */
export interface DeviationRow {
  vehicleId: string;
  workDate: string;
  assignmentCount: number;
  vehiclePlate: string | null;
  driverName: string | null;
  companyNames: string[];
  plannedKm: number | null;
  actualKm: number | null;
  deviationKm: number | null;
  deviationLiters: number | null;
  deviationCostEur: number | null;
  suspicious: boolean;
  missing: DeviationResult['missing'];
}

@Injectable()
export class RouteDeviationService {
  private readonly logger = new Logger(RouteDeviationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: RoutingService,
  ) {}

  /**
   * Donem icindeki litre fiyati.
   *
   * Yakit karti islemlerinin toplam tutari / toplam litresi. Tek bir fisin
   * fiyatini kullanmak yaniltici olurdu — fiyat gun gune ve istasyona gore
   * degisiyor; agirlikli ortalama donemin gercek maliyetini yansitir.
   */
  private async averagePricePerLiter(from: Date, to: Date): Promise<number | null> {
    const totals = await this.prisma.fleetFuelEntry.aggregate({
      where: { enteredAt: { gte: from, lt: to } },
      _sum: { liters: true, totalCost: true },
    });

    const liters = Number(totals._sum.liters ?? 0);
    const cost = Number(totals._sum.totalCost ?? 0);
    if (liters <= 0 || cost <= 0) {
      return null;
    }
    return cost / liters;
  }

  /**
   * Planlanan vs gerceklesen mesafe raporu — ARAC-GUN duzeyinde.
   *
   * Planlanan: o arac-gunundeki tum gorevlerin alis->teslim Valhalla
   * rotalarinin toplami (onbellekli).
   * Gerceklesen: ayni arac ve gune ait kapali GPS seferlerinin toplami.
   *
   * `limit` arac-gun sayisini sinirlar; her satir birden fazla Valhalla
   * cagrisi gerektirebildigi icin rapor sinirsiz donem tarayamaz.
   */
  async buildReport(params: { from: Date; to: Date; limit?: number }): Promise<{
    from: string;
    to: string;
    pricePerLiter: number | null;
    totals: ReturnType<typeof sumDeviations> & { suspicious: number };
    rows: DeviationRow[];
  }> {
    const limit = Math.min(params.limit ?? 100, 300);

    const assignments = await this.prisma.assignment.findMany({
      where: {
        workDate: { gte: params.from, lt: params.to },
        pickupLocationId: { not: null },
        deliveryLocationId: { not: null },
      },
      orderBy: { workDate: 'desc' },
      select: {
        id: true,
        workDate: true,
        vehicleId: true,
        pickupLocationId: true,
        deliveryLocationId: true,
        vehicle: { select: { plateNumber: true, avgConsumptionLPer100Km: true } },
        driver: { select: { firstName: true, lastName: true } },
        company: { select: { name: true } },
      },
    });

    // Arac + gun anahtarinda grupla
    const groups = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const day = assignment.workDate.toISOString().slice(0, 10);
      const key = `${assignment.vehicleId}|${day}`;
      const bucket = groups.get(key);
      if (bucket) bucket.push(assignment);
      else groups.set(key, [assignment]);
    }

    const keys = [...groups.keys()].slice(0, limit);
    const pricePerLiter = await this.averagePricePerLiter(params.from, params.to);

    const rows: DeviationRow[] = [];
    const results: DeviationResult[] = [];
    let suspicious = 0;

    for (const key of keys) {
      const group = groups.get(key)!;
      const [vehicleId, day] = key.split('|');
      const dayStart = new Date(`${day}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      // Planlanan: gruptaki her gorevin rotasi. Biri bile hesaplanamazsa
      // toplam eksik kalir ve satir "planned" eksigiyle isaretlenir —
      // yarim toplami tam gibi gostermek sapmayi olduğundan buyuk yansitirdi.
      let plannedKm: number | null = 0;
      for (const assignment of group) {
        const km = await this.plannedDistanceKm(
          assignment.pickupLocationId!,
          assignment.deliveryLocationId!,
        );
        if (km === null) {
          plannedKm = null;
          break;
        }
        plannedKm += km;
      }

      const trips = await this.prisma.fleetTrip.aggregate({
        where: {
          vehicleId,
          status: FleetTripStatus.closed,
          startedAt: { gte: dayStart, lt: dayEnd },
        },
        _sum: { distanceKm: true },
      });
      const actualRaw = trips._sum.distanceKm;
      const actualKm = actualRaw === null ? null : Number(actualRaw);

      const consumption =
        group[0].vehicle.avgConsumptionLPer100Km === null
          ? null
          : Number(group[0].vehicle.avgConsumptionLPer100Km);

      const result = computeDeviation({
        plannedKm,
        actualKm,
        consumptionLPer100Km: consumption,
        pricePerLiter,
      });
      results.push(result);

      const flagged = isSuspicious(plannedKm, actualKm);
      if (flagged) suspicious += 1;

      rows.push({
        vehicleId,
        workDate: day,
        assignmentCount: group.length,
        vehiclePlate: group[0].vehicle.plateNumber,
        driverName: `${group[0].driver.firstName} ${group[0].driver.lastName}`.trim(),
        companyNames: [...new Set(group.map((a) => a.company.name))],
        plannedKm: plannedKm === null ? null : Number(plannedKm.toFixed(3)),
        actualKm: actualKm === null ? null : Number(actualKm.toFixed(3)),
        deviationKm: result.deviationKm,
        deviationLiters: result.deviationLiters,
        deviationCostEur: result.deviationCostEur,
        suspicious: flagged,
        missing: result.missing,
      });
    }

    // En buyuk sapma en ustte — operasyon once oraya bakmali
    rows.sort((a, b) => (b.deviationKm ?? -Infinity) - (a.deviationKm ?? -Infinity));

    return {
      from: params.from.toISOString(),
      to: params.to.toISOString(),
      pricePerLiter: pricePerLiter === null ? null : Number(pricePerLiter.toFixed(4)),
      totals: { ...sumDeviations(results), suspicious },
      rows,
    };
  }

  /**
   * Iki Location arasindaki planlanan mesafe. RoutingService'in Redis
   * onbellegini kullanir; ayni adres cifti onlarca gorevde tekrar ettigi icin
   * (olculdu: 1029 gorevde 31 benzersiz adres) isabet orani cok yuksek.
   */
  private async plannedDistanceKm(
    pickupLocationId: string,
    deliveryLocationId: string,
  ): Promise<number | null> {
    const result = await this.routing.routePreviewBetweenLocations(
      pickupLocationId,
      deliveryLocationId,
    );
    if (!result.ok) {
      return null;
    }
    return Number(result.value.distanceKm.toFixed(3));
  }

  /** Varsayilan kamyon profili disa aciliyor ki rapor ile plan ayni tabana dayansin. */
  get truckProfile() {
    return DEFAULT_TRUCK_PROFILE;
  }
}
