import { IsEnum, IsOptional, IsString } from 'class-validator';
import { FineStatus } from '@prisma/client';

export class UpdateFineStatusDto {
  @IsEnum(FineStatus)
  status!: FineStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
