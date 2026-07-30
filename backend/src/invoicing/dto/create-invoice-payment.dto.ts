import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { InvoicePaymentMethod } from '@prisma/client';

export class CreateInvoicePaymentDto {
  @IsInt() @Min(1) amountCents!: number;
  @IsDateString() paidAt!: string;
  @IsEnum(InvoicePaymentMethod) method!: InvoicePaymentMethod;
  @IsOptional() @IsString() @MaxLength(255) reference?: string;
  @IsOptional() @IsString() @MaxLength(2_000) note?: string;
}
