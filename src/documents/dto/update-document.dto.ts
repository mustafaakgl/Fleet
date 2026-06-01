import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

const DOCUMENT_STATUSES = ['valid', 'expiring_soon', 'expired', 'missing', 'archived'] as const;

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsEnum(DOCUMENT_STATUSES)
  status?: (typeof DOCUMENT_STATUSES)[number];

  @IsOptional()
  @IsString()
  notes?: string;
}
