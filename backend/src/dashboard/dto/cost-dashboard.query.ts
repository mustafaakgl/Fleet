import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { PERIOD_MONTH_OPTIONS } from '../core/cost-dashboard.util';

/**
 * Maliyet dashboard'u filtreleri.
 *
 * Global ValidationPipe `forbidNonWhitelisted` ile calistigi icin buradaki
 * alanlarin DISINDA bir sey gondermek 400 uretir — girdiler whitelist edilmis
 * durumda ve serbest metin bir sorguya donusmuyor.
 */
export class CostDashboardQueryDto {
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

  @IsOptional()
  @IsString()
  @Length(1, 64)
  vehicleId?: string;

  @IsOptional()
  @IsEnum(['total', 'costPerKm', 'margin', 'change'] as unknown as object)
  sort?: 'total' | 'costPerKm' | 'margin' | 'change';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
