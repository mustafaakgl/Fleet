import { DatevPayrollSystem, PayrollMovementType } from '@prisma/client';
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertWageTypeMappingDto {
  /** LODAS ile Lohn und Gehalt ayni Lohnart planini kullanmak zorunda degil. */
  @IsEnum(DatevPayrollSystem) payrollSystem!: DatevPayrollSystem;
  @IsEnum(PayrollMovementType) movementType!: PayrollMovementType;
  @IsString() @MaxLength(20) datevWageTypeNumber!: string;
  /** Kapali ise bu kova ihracata girmez. */
  @IsOptional() @IsBoolean() enabled?: boolean;

  /**
   * Bu numaranin gecerlilik baslangici. Verilmezse bugun: Lohnart planlari yil
   * icinde degisiyor ve gecmis donem O TARIHTEKI numarayla uretilmeli.
   */
  @IsOptional() @IsISO8601() validFrom?: string;
  @IsOptional() @IsISO8601() validTo?: string;

  @IsOptional() @IsString() @MaxLength(36) costCenter?: string;
  @IsOptional() @IsString() @MaxLength(36) costUnit?: string;
}
