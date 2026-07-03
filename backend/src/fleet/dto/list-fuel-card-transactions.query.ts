import { FuelCardTransactionStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class ListFuelCardTransactionsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  batchId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  vehicleId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  driverId?: string;

  @IsOptional()
  @IsEnum(FuelCardTransactionStatus)
  status?: FuelCardTransactionStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
