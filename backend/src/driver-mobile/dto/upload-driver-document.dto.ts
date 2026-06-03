import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadDriverDocumentDto {
  @IsString()
  documentType!: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
