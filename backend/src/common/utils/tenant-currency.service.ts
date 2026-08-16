import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../tenant/tenant-context';
import { DEFAULT_BASE_CURRENCY, normalizeCurrency } from './currency';

/**
 * Kiracinin temel para birimini SUNUCUDA cozer.
 *
 * NEDEN AYRI BIR SERVIS: parasal kayit yaratan her uc (servis kaydi, ceza,
 * ileride digerleri) ayni soruyu soruyor ve cevabi ISTEMCIDEN ALMAMALI.
 * Istemcinin gonderdigi bir `currency` alanina guvenmek, TRY bir kiracida
 * tutari EUR diye etiketleyip toplama sokmak demek olurdu.
 *
 * Prisma semasindaki `@default("EUR")` yalnizca migration backfill'i icin
 * dogru bir varsayilan; YENI kayitlarda yetmez, cunku kiraci TRY olabilir.
 */
@Injectable()
export class TenantCurrencyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Oturumdaki kiracinin temel para birimi.
   *
   * Kiraci baglami yoksa (ornegin zamanlanmis is) belgelenmis varsayilan
   * kullaniliyor — sessizce bos birakmak, kaydin para birimsiz kalmasi
   * demek olurdu.
   */
  async resolveBaseCurrency(): Promise<string> {
    const tenantId = TenantContext.getTenantId();
    if (!tenantId) {
      return DEFAULT_BASE_CURRENCY;
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { baseCurrency: true },
    });

    return normalizeCurrency(tenant?.baseCurrency) ?? DEFAULT_BASE_CURRENCY;
  }
}
