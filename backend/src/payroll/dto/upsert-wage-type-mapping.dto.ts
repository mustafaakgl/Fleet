import { PayrollWageType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertWageTypeMappingDto {
  @IsEnum(PayrollWageType) wageType!: PayrollWageType;
  @IsString() @MaxLength(20) datevWageTypeNumber!: string;
  /** Kapali ise bu kova ihracata girmez. */
  @IsOptional() @IsBoolean() enabled?: boolean;
}
