import { IsDateString } from 'class-validator';

export class CopyDayDto {
  @IsDateString()
  from_date!: string;

  @IsDateString()
  to_date!: string;
}
