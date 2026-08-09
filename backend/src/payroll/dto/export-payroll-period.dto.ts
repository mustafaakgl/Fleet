import { PayrollExportFormat } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ExportPayrollPeriodDto {
  /** Varsayilan notr CSV; gercek DATEV bicimi netlestiginde eklenecek. */
  @IsOptional() @IsEnum(PayrollExportFormat) format?: PayrollExportFormat;
}
