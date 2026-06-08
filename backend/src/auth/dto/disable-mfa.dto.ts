import { IsString, Length, Matches, MinLength } from 'class-validator';

export class DisableMfaDto {
  @IsString()
  @MinLength(1)
  password!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
