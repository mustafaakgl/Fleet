import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { PERIOD_MONTH_OPTIONS } from '../../dashboard/core/cost-dashboard.util';

/**
 * Finance ekraninin donem filtresi.
 *
 * Maliyet panosunun DTO'sunun kopyasi DEGIL, kucuk bir alt kumesi: bu ekranda
 * arac filtresi, siralama ve sayfalama yok. Global `ValidationPipe`
 * `forbidNonWhitelisted` ile calistigi icin buradaki alanlarin disinda bir sey
 * gondermek 400 uretir.
 */
export class FinanceSummaryQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  /** Hazir donem. Serbest sayi degil: yalnizca 1, 3, 6, 12. */
  @IsOptional()
  @Type(() => Number)
  @IsEnum(PERIOD_MONTH_OPTIONS as unknown as object)
  months?: number;
}
