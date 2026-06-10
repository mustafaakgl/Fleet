import { IsArray, IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateDriverLicenseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  license_number?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  classes?: string[];

  @IsOptional()
  @IsDateString()
  issued_at?: string;

  @IsOptional()
  @IsDateString()
  expires_at?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  issuing_authority?: string;
}
