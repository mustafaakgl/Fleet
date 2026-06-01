import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

const HANDOVER_PHOTO_STATUSES = ['not_required', 'missing', 'uploaded', 'approved', 'rejected'] as const;
const HANDOVER_STATUSES = ['pending', 'completed'] as const;

export class UpdateVehicleHandoverDto {
  @IsOptional()
  @IsEnum(HANDOVER_PHOTO_STATUSES)
  photoStatus?: (typeof HANDOVER_PHOTO_STATUSES)[number];

  @IsOptional()
  @IsBoolean()
  damageDetected?: boolean;

  @IsOptional()
  @IsString()
  damageNotes?: string;

  @IsOptional()
  @IsEnum(HANDOVER_STATUSES)
  status?: (typeof HANDOVER_STATUSES)[number];

  @IsOptional()
  @IsString()
  notes?: string;
}
