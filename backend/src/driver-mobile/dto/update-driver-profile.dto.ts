import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateDriverProfileDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  license_number?: string;

  @IsOptional()
  @IsDateString()
  license_expiry_date?: string;

  @IsString()
  @MinLength(1)
  home_address_street!: string;

  @IsString()
  @MinLength(1)
  home_address_zip_code!: string;

  @IsString()
  @MinLength(1)
  home_address_city!: string;

  @IsString()
  @MinLength(1)
  home_address_country!: string;
}
