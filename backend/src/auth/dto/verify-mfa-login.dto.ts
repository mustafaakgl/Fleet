import { IsString, Length, Matches, MinLength } from 'class-validator';

export class VerifyMfaLoginDto {
  @IsString()
  @MinLength(10)
  mfa_token!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
