import { IsString } from 'class-validator';

export class CreatePayrollCorrectionsDto {
  /** Farki tasinacak, dondurulmus donem. */
  @IsString() sourcePeriodId!: string;
}
