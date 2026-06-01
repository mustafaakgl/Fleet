import { IsEmail, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  contact_person?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  default_daily_revenue?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
