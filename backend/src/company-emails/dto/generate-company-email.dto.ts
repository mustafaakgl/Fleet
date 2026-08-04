import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsDateString, IsNotEmpty, IsString } from 'class-validator';

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

/**
 * Toplu gonderim istegi. Ekran bugun + yarini gosterdigi icin birden fazla gun
 * gelebiliyor. Ust sinir kazara tum yili gondermeyi engeller.
 */
export class SendCompanyEmailsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(31)
  @IsDateString({}, { each: true })
  dates!: string[];
}
