import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
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
  /** BT-30 (Handelsregisternummer). EN 16931 BR-CO-26 needs it when there is no VAT id. */
  @IsOptional() @IsString() @MaxLength(50) registrationNumber?: string;
  /** BT-42. XRechnung BR-DE-6 requires it, BR-DE-27 wants at least three digits. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^[+()/\d][\d\s()/.-]*$/, { message: 'phone must be a plain telephone number' })
  @Matches(/(\d[\s()/.-]*){3,}/, { message: 'phone must contain at least three digits' })
  phone?: string;
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

  // DATEV bookkeeping export settings. Optional: they keep their defaults until the
  // tax advisor supplies the client's chart of accounts.
  @IsOptional() @IsString() @MaxLength(20) datevConsultantNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) datevClientNumber?: string;
  @IsOptional() @IsIn(['SKR03', 'SKR04']) datevChart?: 'SKR03' | 'SKR04';
  @IsOptional() @IsString() @Matches(/^\d{3,8}$/) revenueAccount19?: string;
  @IsOptional() @IsString() @Matches(/^\d{3,8}$/) revenueAccount7?: string;
  @IsOptional() @IsString() @Matches(/^\d{3,8}$/) revenueAccount0?: string;
  @IsOptional() @IsString() @Matches(/^\d{3,8}$/) revenueAccountReverseCharge?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) debtorNumberStart?: number;
}
