import { PayrollEmploymentType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpsertDriverPayrollProfileDto {
  @IsString() @MaxLength(20) datevPersonnelNumber!: string;

  /** Bos birakilirsa tenant varsayilani gecerli olur. */
  @IsOptional() @IsInt() @Min(1) @Max(10_080) weeklyTargetMinutes?: number;
  /** Dolu ise aylik hedef haftaliktan turetilmez. Ust sinir 31×24 saat. */
  @IsOptional() @IsInt() @Min(1) @Max(44_640) monthlyTargetMinutes?: number;

  @IsOptional() @IsString() @MaxLength(36) costCenter?: string;
  @IsOptional() @IsString() @MaxLength(36) costUnit?: string;
  @IsOptional() @IsEnum(PayrollEmploymentType) employmentType?: PayrollEmploymentType;
}
