import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FuelEntryWorkflowStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_BASE_CURRENCY,
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
  normalizeCurrency,
} from '../common/utils/currency';
import {
  SUGGESTED_TIME_ZONES,
  isSupportedTimeZone,
  normalizeTimeZone,
  resolveTimeZone,
} from '../common/utils/timezone';
import { TenantContext } from './tenant-context';

export interface TenantCurrencySettings {
  baseCurrency: string;
  /** IANA kimligi — rapor ay sinirlari buna gore hesaplanir. */
  timezone: string;
  suggestedTimeZones: readonly string[];
  supportedCurrencies: readonly string[];
  /** false ise degistirilemez; sebebi `lockedReason`da. */
  changeable: boolean;
  lockedReason: 'has_monetary_records' | null;
  monetaryRecordCounts: { serviceRecords: number; fines: number; fuelEntries: number };
}

/**
 * Kiracinin temel para birimi ayari.
 *
 * DEGISTIRME KURALI: kiracida tek bir parasal kayit bile varsa ayar KILITLI.
 * Sebebi basit — eski tutarlarin uzerine yeni bir etiket yapistirmak, 1.000 EUR
 * servis maliyetini bir anda 1.000 TRY yapar. Bu bir donusum degil, sessiz bir
 * veri bozulmasidir. Yeni bir Turkiye kiracisi hicbir kayit olusturmadan TRY
 * secebilir; sonrasi icin gereken sey gecmise donuk kur donusumudur ve o bu
 * fazin kapsami disinda.
 */
@Injectable()
export class TenantSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private requireTenantId(): string {
    const tenantId = TenantContext.getTenantId();
    if (!tenantId) {
      throw new NotFoundException({ code: 'tenant_not_found' });
    }
    return tenantId;
  }

  /** Kiracida kac parasal kayit var — kilidin dayanagi. */
  private async countMonetaryRecords() {
    const [serviceRecords, fines, fuelEntries] = await Promise.all([
      this.prisma.serviceRecord.count(),
      this.prisma.fine.count(),
      // Taslak fis kilitlemez: heniz bir tutar TASIMIYOR ve surucu onu
      // silebilir. Kesinlesmis ya da onaylanmis olanlar kilitler.
      this.prisma.fleetFuelEntry.count({
        where: {
          workflowStatus: {
            in: [FuelEntryWorkflowStatus.submitted, FuelEntryWorkflowStatus.approved],
          },
        },
      }),
    ]);
    return { serviceRecords, fines, fuelEntries };
  }

  async getCurrencySettings(): Promise<TenantCurrencySettings> {
    const tenantId = this.requireTenantId();
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { baseCurrency: true, timezone: true },
    });
    if (!tenant) {
      throw new NotFoundException({ code: 'tenant_not_found' });
    }

    const counts = await this.countMonetaryRecords();
    const locked = counts.serviceRecords + counts.fines + counts.fuelEntries > 0;

    return {
      baseCurrency: normalizeCurrency(tenant.baseCurrency) ?? DEFAULT_BASE_CURRENCY,
      timezone: resolveTimeZone(tenant.timezone),
      suggestedTimeZones: SUGGESTED_TIME_ZONES,
      supportedCurrencies: SUPPORTED_CURRENCIES,
      changeable: !locked,
      lockedReason: locked ? 'has_monetary_records' : null,
      monetaryRecordCounts: counts,
    };
  }

  /**
   * Zaman dilimini degistirir.
   *
   * PARA BIRIMINDEN FARKLI OLARAK KILITLI DEGIL: zaman dilimi hicbir TUTARI
   * degistirmez, yalnizca raporun ay sinirlarini kaydirir. Kilitlemek,
   * yanlis bolgeyle acilmis bir kiracinin dogru raporu hic gorememesi
   * demek olurdu. Degisimin rapor kovalarini etkiledigi arayuzde yaziyor.
   */
  async setTimezone(userId: string, rawTimezone: string): Promise<TenantCurrencySettings> {
    const tenantId = this.requireTenantId();
    const timezone = normalizeTimeZone(rawTimezone);

    // Gecersiz IANA kimligi REDDEDILIYOR: kaydedilirse her rapor sorgusu
    // patlar ya da sessizce varsayilana duser.
    if (!timezone || !isSupportedTimeZone(timezone)) {
      throw new BadRequestException({ code: 'unsupported_timezone' });
    }

    const current = await this.getCurrencySettings();
    if (current.timezone === timezone) {
      return current;
    }

    await this.prisma.tenant.updateMany({
      where: { id: tenantId },
      data: { timezone },
    });

    await this.audit.logAction({
      actorUserId: userId,
      action: 'tenant.timezone_changed',
      entityType: 'Tenant',
      entityId: tenantId,
      summary: `Zeitzone ${current.timezone} → ${timezone}`,
      metadata: { from: current.timezone, to: timezone, occurredAt: new Date().toISOString() },
    });

    return this.getCurrencySettings();
  }

  async setBaseCurrency(userId: string, rawCurrency: string): Promise<TenantCurrencySettings> {
    const tenantId = this.requireTenantId();
    const currency = normalizeCurrency(rawCurrency);

    if (!currency || !isSupportedCurrency(currency)) {
      throw new BadRequestException({ code: 'unsupported_currency' });
    }

    const current = await this.getCurrencySettings();
    if (current.baseCurrency === currency) {
      // Ayni degeri yeniden yazmak bir DEGISIKLIK degil: kilitli bir kiracida
      // bile reddedilmemeli ve denetime ikinci bir olay dusmemeli.
      return current;
    }

    if (!current.changeable) {
      // Eski tutarlar yeniden ETIKETLENMEZ.
      throw new ConflictException({
        code: 'tenant_base_currency_locked',
        monetaryRecordCounts: current.monetaryRecordCounts,
      });
    }

    await this.prisma.tenant.updateMany({
      where: { id: tenantId },
      data: { baseCurrency: currency },
    });

    await this.audit.logAction({
      actorUserId: userId,
      action: 'tenant.base_currency_changed',
      entityType: 'Tenant',
      entityId: tenantId,
      summary: `Basiswährung ${current.baseCurrency} → ${currency}`,
      metadata: { from: current.baseCurrency, to: currency, occurredAt: new Date().toISOString() },
    });

    return this.getCurrencySettings();
  }
}
