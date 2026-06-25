import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  Max,
  MaxDate,
  MaxLength,
  Min,
  MinDate,
  MinLength,
} from 'class-validator';
import { DriverStatus, RiskLevel } from '@prisma/client';

export enum DriverLicenseType {
  A = 'A',
  A1 = 'A1',
  A2 = 'A2',
  B = 'B',
  BE = 'BE',
  C = 'C',
  CE = 'CE',
  D = 'D',
  DE = 'DE',
}

const LICENSE_NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9-]{4,31}$/i;

const toIsoString = ({ value }: { value: unknown }) => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
};

export class CreateDriverDto {
  @ApiProperty({ description: 'Driver first name', example: 'Mustafa' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  first_name!: string;

  @ApiProperty({ description: 'Driver last name', example: 'Akgul' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  last_name!: string;

  @ApiProperty({ required: false, description: 'Internal employee number', example: 'DRV-1024' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  employee_number?: string;

  @ApiProperty({ required: false, description: 'Driver email address', example: 'driver@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({
    required: false,
    description: 'Driver phone number in international format',
    example: '+4915112345678',
  })
  @IsOptional()
  @IsPhoneNumber('any')
  phone?: string;

  @ApiProperty({ description: 'Driver license number', example: 'B1234-56789' })
  @IsString()
  @IsNotEmpty()
  @Matches(LICENSE_NUMBER_PATTERN, {
    message: 'license_number must match the expected license number format',
  })
  @MaxLength(32)
  license_number!: string;

  @ApiProperty({
    description: 'License expiry date in ISO 8601 format',
    example: '2028-12-31',
  })
  @Type(() => Date)
  @Transform(toIsoString, { toClassOnly: true })
  @IsDateString()
  @MinDate(new Date())
  license_expiry_date!: string;

  @ApiProperty({ required: false, description: 'Optional passport number', example: 'P1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  passport_number?: string;

  @ApiProperty({
    required: false,
    description: 'Passport expiry date in ISO 8601 format',
    example: '2029-06-30',
  })
  @IsOptional()
  @Type(() => Date)
  @Transform(toIsoString, { toClassOnly: true })
  @IsDateString()
  @MinDate(new Date())
  passport_expiry_date?: string;

  @ApiProperty({
    required: false,
    description: 'Driver date of birth in ISO 8601 date format',
    example: '1990-01-15',
  })
  @IsOptional()
  @Type(() => Date)
  @Transform(toIsoString, { toClassOnly: true })
  @IsDateString()
  @MaxDate(new Date())
  date_of_birth?: string;

  @ApiProperty({ required: false, description: 'Street address', example: 'Main Street 12' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  home_address_street?: string;

  @ApiProperty({ required: false, description: 'Postal code', example: '10115' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  home_address_zip_code?: string;

  @ApiProperty({ required: false, description: 'City', example: 'Berlin' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  home_address_city?: string;

  @ApiProperty({ required: false, description: 'Country', example: 'Germany' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  home_address_country?: string;

  @ApiProperty({
    required: false,
    enum: DriverLicenseType,
    description: 'Driver license class/type',
    example: DriverLicenseType.B,
  })
  @IsOptional()
  @IsEnum(DriverLicenseType)
  license_type?: DriverLicenseType;

  @ApiProperty({
    required: false,
    enum: DriverStatus,
    description: 'Driver status',
    example: DriverStatus.active,
  })
  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;

  @ApiProperty({
    required: false,
    enum: RiskLevel,
    description: 'Driver risk level',
    example: RiskLevel.green,
  })
  @IsOptional()
  @IsEnum(RiskLevel)
  risk_level?: RiskLevel;

  @ApiProperty({ required: false, description: 'Internal notes', example: 'Prefers early shifts' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({
    required: false,
    description: 'Vacation entitlement days',
    example: 24,
    minimum: 0,
    maximum: 365,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(365)
  vacation_entitlement_days?: number;

  @ApiProperty({
    required: false,
    description: 'Vacation carry-over days',
    example: 0,
    minimum: -365,
    maximum: 365,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-365)
  @Max(365)
  vacation_carry_over_days?: number;
}
