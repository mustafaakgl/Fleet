import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertBillingProfileDto {
  @IsString() @MaxLength(200) legalName!: string;
  @IsString() @MaxLength(200) street!: string;
  @IsString() @MaxLength(20) postalCode!: string;
  @IsString() @MaxLength(100) city!: string;
  @IsString() @Matches(/^[A-Z]{2}$/) countryCode: string = 'DE';
  @IsOptional() @IsString() @MaxLength(50) taxNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) vatId?: string;
  @IsString() @MaxLength(34) iban!: string;
  @IsOptional() @IsString() @MaxLength(11) bic?: string;
  @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @IsString() @MaxLength(80) invoiceNumberFormat: string = 'RE-{YYYY}-{00001}';
  @Type(() => Number) @IsInt() @Min(0) @Max(365) defaultPaymentTermDays: number = 14;
  @Type(() => Number) @IsInt() @Min(0) @Max(10_000) defaultTaxRateBasisPoints: number = 1_900;
  @IsBoolean() smallBusinessRule: boolean = false;
  @IsOptional() @IsString() @MaxLength(2_000) invoiceFooterText?: string;
  @IsOptional() @IsEmail() invoiceEmailCc?: string;
  @IsBoolean() dunningEnabled: boolean = true;
  @Type(() => Number) @IsInt() @Min(0) @Max(365) dunningLevel1Days: number = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(365) dunningLevel2Days: number = 14;
  @Type(() => Number) @IsInt() @Min(1) @Max(365) dunningLevel3Days: number = 28;
  @Type(() => Number) @IsInt() @Min(0) dunningLevel1FeeCents: number = 0;
  @Type(() => Number) @IsInt() @Min(0) dunningLevel2FeeCents: number = 500;
  @Type(() => Number) @IsInt() @Min(0) dunningLevel3FeeCents: number = 1_000;
}
