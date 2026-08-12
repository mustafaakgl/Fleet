import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FuelCompatibilitySource,
  FuelProductType,
  FuelProductUsage,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { safeAuditLog } from '../../audit/audit-helper';
import { PrismaService } from '../../prisma/prisma.service';
import {
  compatibleProductsForStationFilter,
  type CompatibilityRow,
} from './core/fuel-compatibility.util';

export interface VehicleFuelCompatibilityView {
  id: string;
  productType: FuelProductType;
  usageType: FuelProductUsage;
  approved: boolean;
  source: FuelCompatibilitySource;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleFuelCompatibilityResponse {
  vehicle: { id: string; plateNumber: string };
  /** Istasyon filtresinde kullanilacak urunler (approved + PRIMARY/ALTERNATIVE). */
  compatibleProducts: FuelProductType[];
  entries: VehicleFuelCompatibilityView[];
}

export interface ReplaceCompatibilityEntry {
  productType: FuelProductType;
  usageType: FuelProductUsage;
  approved?: boolean;
  source: FuelCompatibilitySource;
  verifiedAt?: string | null;
}

/**
 * Arac yakit uyumlulugunun okunmasi ve degistirilmesi.
 *
 * Butun sorgular tenant kapsamli PrismaService uzerinden gidiyor; baska
 * kiracinin araci `findFirst` ile bulunamadigi icin hem okuma hem yazma
 * kiracinin sinirinda kaliyor.
 */
@Injectable()
export class VehicleFuelCompatibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * ADBLUE yalnizca ADDITIVE olabilir.
   *
   * Neden sert kural: AdBlue bir yakit degil, SCR katkisi. PRIMARY olarak
   * kaydedilirse istasyon filtresine girer ve sadece AdBlue satan bir nokta
   * dizel arac icin "uygun istasyon" olarak surucuye doner.
   */
  private assertUsageRules(entry: ReplaceCompatibilityEntry): void {
    if (entry.productType === FuelProductType.ADBLUE && entry.usageType !== FuelProductUsage.ADDITIVE) {
      throw new BadRequestException({
        code: 'adblue_must_be_additive',
        productType: entry.productType,
        usageType: entry.usageType,
      });
    }

    // Tersi de gecerli: ADDITIVE bugun yalnizca AdBlue icin anlamli. Baska bir
    // urunu ADDITIVE isaretlemek onu istasyon filtresinden sessizce dusurur —
    // "kaydettim ama hicbir sey olmadi" durumunu engellemek icin reddediliyor.
    if (entry.usageType === FuelProductUsage.ADDITIVE && entry.productType !== FuelProductType.ADBLUE) {
      throw new BadRequestException({
        code: 'additive_usage_only_for_adblue',
        productType: entry.productType,
        usageType: entry.usageType,
      });
    }
  }

  private assertNoDuplicates(entries: readonly ReplaceCompatibilityEntry[]): void {
    const seen = new Set<string>();
    for (const entry of entries) {
      const key = `${entry.productType}:${entry.usageType}`;
      if (seen.has(key)) {
        throw new BadRequestException({
          code: 'duplicate_fuel_compatibility_entry',
          productType: entry.productType,
          usageType: entry.usageType,
        });
      }
      seen.add(key);
    }
  }

  private async requireVehicle(vehicleId: string): Promise<{ id: string; plateNumber: string }> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId },
      select: { id: true, plateNumber: true },
    });
    if (!vehicle) {
      // Baska kiracinin araci da bu dala duser: kapsamli istemci onu
      // dondurmedigi icin "var ama senin degil" ayrimi sizmaz.
      throw new NotFoundException({ code: 'vehicle_not_found' });
    }
    return vehicle;
  }

  private toView(row: {
    id: string;
    productType: FuelProductType;
    usageType: FuelProductUsage;
    approved: boolean;
    source: FuelCompatibilitySource;
    verifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): VehicleFuelCompatibilityView {
    return {
      id: row.id,
      productType: row.productType,
      usageType: row.usageType,
      approved: row.approved,
      source: row.source,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Filtreleme icin ham satirlar. Kayit yoksa bos dizi doner. */
  async listRowsForVehicle(vehicleId: string): Promise<CompatibilityRow[]> {
    return this.prisma.vehicleFuelCompatibility.findMany({
      where: { vehicleId },
      select: { productType: true, usageType: true, approved: true },
    });
  }

  async getForVehicle(vehicleId: string): Promise<VehicleFuelCompatibilityResponse> {
    const vehicle = await this.requireVehicle(vehicleId);
    const rows = await this.prisma.vehicleFuelCompatibility.findMany({
      where: { vehicleId },
      orderBy: [{ usageType: 'asc' }, { productType: 'asc' }],
    });

    return {
      vehicle,
      compatibleProducts: compatibleProductsForStationFilter(rows),
      entries: rows.map((row) => this.toView(row)),
    };
  }

  /**
   * Uyumluluk setini TAMAMEN degistirir.
   *
   * Tek transaction icinde sil + yaz: yarim uygulanmis bir set, aracin
   * gercekte kabul etmedigi bir urunun onayli gorunmesi anlamina gelir.
   * Bos dizi gonderilmesi gecerli bir islem — "uyumluluk tanimsiz" durumuna
   * geri donmenin yolu.
   */
  async replaceForVehicle(
    vehicleId: string,
    entries: readonly ReplaceCompatibilityEntry[],
    actorUserId: string,
  ): Promise<VehicleFuelCompatibilityResponse> {
    const vehicle = await this.requireVehicle(vehicleId);

    this.assertNoDuplicates(entries);
    for (const entry of entries) {
      this.assertUsageRules(entry);
    }

    const before = await this.prisma.vehicleFuelCompatibility.findMany({
      where: { vehicleId },
      select: { productType: true, usageType: true, approved: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicleFuelCompatibility.deleteMany({ where: { vehicleId } });
      if (entries.length === 0) {
        return;
      }
      await tx.vehicleFuelCompatibility.createMany({
        data: entries.map((entry) => ({
          vehicleId,
          productType: entry.productType,
          usageType: entry.usageType,
          approved: entry.approved ?? true,
          source: entry.source,
          verifiedAt: entry.verifiedAt ? new Date(entry.verifiedAt) : null,
        })),
      });
    });

    // Mevcut audit altyapisi kullaniliyor (safeAuditLog: log yazimi basarisiz
    // olursa is akisi durmaz). Yanlis yakit hasarinda "bu onayi kim koydu"
    // sorusunun cevabi burada.
    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'vehicle.fuel_compatibility_replaced',
      entityType: 'vehicle',
      entityId: vehicleId,
      summary: `Fuel compatibility replaced for ${vehicle.plateNumber}`,
      metadata: {
        before: before.map((row) => `${row.productType}:${row.usageType}:${row.approved}`),
        after: entries.map(
          (entry) => `${entry.productType}:${entry.usageType}:${entry.approved ?? true}`,
        ),
      } satisfies Prisma.InputJsonObject,
    });

    return this.getForVehicle(vehicleId);
  }
}
