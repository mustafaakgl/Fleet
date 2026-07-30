import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { InvoiceTaxCategory, InvoiceUnit } from '@prisma/client';

export class UpdateInvoiceLineDto {
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() quantity?: string;
  @IsOptional() @IsEnum(InvoiceUnit) unit?: InvoiceUnit;
  @IsOptional() @IsInt() @Min(0) unitPriceCents?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10_000) taxRateBasisPoints?: number;
  @IsOptional() @IsEnum(InvoiceTaxCategory) taxCategory?: InvoiceTaxCategory;
  @IsOptional() @IsDateString() serviceDate?: string;
}
