import { IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const HANDOVER_TYPES = ['pickup', 'return'] as const;

export class CreateVehicleHandoverDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsString()
  @IsNotEmpty()
  vehicleId!: string;

  @IsOptional()
  @IsString()
  previousVehicleId?: string;

  @IsOptional()
  @IsString()
  assignmentId?: string;

  @IsEnum(HANDOVER_TYPES)
  handoverType!: (typeof HANDOVER_TYPES)[number];

  @IsDateString()
  handoverDateTime!: string;

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
