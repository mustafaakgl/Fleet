import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

const COMPANY_EMAIL_STATUSES = ['draft', 'needs_review', 'sent', 'failed'] as const;

export class UpdateCompanyEmailDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsEnum(COMPANY_EMAIL_STATUSES)
  status?: (typeof COMPANY_EMAIL_STATUSES)[number];
}
