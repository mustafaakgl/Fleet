import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { RequestType } from '@prisma/client';

export class CreateLeaveRequestDto {
  @IsString()
  @MinLength(1)
  driver_id!: string;

  @IsEnum(RequestType)
  type!: RequestType;

  @IsDateString()
  start_date!: string;

  @IsDateString()
  end_date!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
