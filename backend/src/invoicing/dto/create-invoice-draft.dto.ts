import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { InvoiceTaxCategory, InvoiceUnit } from '@prisma/client';

export class ManualInvoiceLineDto {
  @IsString() @MaxLength(500) description!: string;
  @IsString() quantity!: string;
  @IsEnum(InvoiceUnit) unit!: InvoiceUnit;
  @IsInt() @Min(0) unitPriceCents!: number;
  @IsInt() @Min(0) @Max(10_000) taxRateBasisPoints!: number;
  @IsEnum(InvoiceTaxCategory) taxCategory!: InvoiceTaxCategory;
  @IsOptional() @IsDateString() serviceDate?: string;
}

export class CreateInvoiceDraftDto {
  @IsString() companyId!: string;
  @IsDateString() servicePeriodStart!: string;
  @IsDateString() servicePeriodEnd!: string;
  @IsOptional() @IsDateString() invoiceDate?: string;
  @IsOptional() @IsInt() @Min(0) @Max(365) paymentTermDays?: number;
  @IsOptional() @IsString() @MaxLength(2_000) notes?: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  assignmentIds: string[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualInvoiceLineDto)
  manualLines: ManualInvoiceLineDto[] = [];
}
