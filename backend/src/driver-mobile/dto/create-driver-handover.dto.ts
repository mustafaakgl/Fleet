import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

const HANDOVER_TYPES = ['pickup', 'return'] as const;

export class CreateDriverHandoverDto {
  @IsString()
  vehicleId!: string;

  @IsOptional()
  @IsString()
  previousVehicleId?: string;

  @IsOptional()
  @IsString()
  assignmentId?: string;

  @IsOptional()
  @IsEnum(HANDOVER_TYPES)
  handoverType?: (typeof HANDOVER_TYPES)[number];

  @IsOptional()
  @IsDateString()
  handoverDateTime?: string;

  @IsOptional()
  @IsBoolean()
  damageDetected?: boolean;

  @IsOptional()
  @IsString()
  damageNotes?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
