import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^ExponentPushToken\[.+\]$/)
  token!: string;
}
