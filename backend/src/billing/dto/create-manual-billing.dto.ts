import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { BillingPlan } from '@prisma/client';

export class CreateManualBillingDto {
  @IsString()
  tenant_id!: string;

  @IsEnum(BillingPlan)
  plan!: BillingPlan;

  @IsOptional()
  @IsEmail()
  billing_email?: string;

  @IsOptional()
  @IsString()
  invoice_reference?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  monthly_amount_cents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  vehicle_limit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000)
  seat_limit?: number;
}
