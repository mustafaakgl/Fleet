import { IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/is-strong-password.decorator';

export class ConfirmPasswordResetDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @IsStrongPassword()
  password!: string;
}
