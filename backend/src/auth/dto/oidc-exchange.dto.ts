import { IsString, MinLength } from 'class-validator';

export class OidcExchangeDto {
  @IsString()
  @MinLength(16)
  code!: string;
}
