import { DatevPayrollSystem, GermanState } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Gun ici dakika (0–1439). Gece penceresi gece yarisini astigi icin saat degil dakika. */
const MINUTE_OF_DAY_MAX = 1_439;

export class UpsertTenantPayrollProfileDto {
  @IsOptional() @IsString() @MaxLength(20) datevConsultantNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) datevClientNumber?: string;
  @IsOptional() @IsEnum(GermanState) bundesland?: GermanState;

  /**
   * Hedef DATEV bordro urunu. Ihracat bunu bilmeden dosya uretemez; bos
   * birakilirsa donem DATEV-hazir sayilmiyor.
   */
  @IsOptional() @IsEnum(DatevPayrollSystem) datevPayrollSystem?: DatevPayrollSystem;

  @IsOptional() @IsInt() @Min(0) @Max(MINUTE_OF_DAY_MAX) nightWindowStartMinute?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MINUTE_OF_DAY_MAX) nightWindowEndMinute?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MINUTE_OF_DAY_MAX) nightCoreStartMinute?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MINUTE_OF_DAY_MAX) nightCoreEndMinute?: number;

  /** 1 = yuvarlama yok. Ust sinir bir saat: daha buyugu gunu anlamsiz kaydirir. */
  @IsOptional() @IsInt() @Min(1) @Max(60) roundingMinutes?: number;

  /** Haftalik hedef. Ust sinir 7×24 saat. */
  @IsOptional() @IsInt() @Min(1) @Max(10_080) defaultWeeklyTargetMinutes?: number;

  /**
   * Surucunun bastigi mola ile takografin REST kaydi arasinda kabul edilen
   * fark. 0 = her fark incelenir.
   */
  @IsOptional() @IsInt() @Min(0) @Max(240) tachoBreakToleranceMinutes?: number;
}
