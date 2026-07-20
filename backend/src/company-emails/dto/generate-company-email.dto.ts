import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class GenerateCompanyEmailDto {
  @IsDateString()
  date!: string;

  @IsString()
  @IsNotEmpty()
  companyId!: string;
}

export class GenerateCompanyEmailsForDateDto {
  @IsDateString()
  date!: string;
}
