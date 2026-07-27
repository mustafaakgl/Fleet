import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateInvoiceDraftDto {
  @IsOptional() @IsDateString() servicePeriodStart?: string;
  @IsOptional() @IsDateString() servicePeriodEnd?: string;
  @IsOptional() @IsDateString() invoiceDate?: string;
  @IsOptional() @IsInt() @Min(0) @Max(365) paymentTermDays?: number;
  @IsOptional() @IsString() @MaxLength(2_000) notes?: string;
}
