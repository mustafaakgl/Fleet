import { IsOptional, IsString, MinLength } from 'class-validator';

export class RejectLicenseCheckDto {
  @IsString()
  @MinLength(3)
  rejection_reason!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
