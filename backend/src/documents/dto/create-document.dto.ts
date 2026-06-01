import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const DOCUMENT_OWNER_TYPES = [
  'driver',
  'vehicle',
  'company',
  'request',
  'accident',
  'cargo_damage',
  'vehicle_handover',
  'assignment',
  'service_record',
] as const;

export class CreateDocumentDto {
  @IsEnum(DOCUMENT_OWNER_TYPES)
  ownerType!: (typeof DOCUMENT_OWNER_TYPES)[number];

  @IsString()
  @IsNotEmpty()
  ownerId!: string;

  @IsString()
  @IsNotEmpty()
  documentType!: string;

  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
