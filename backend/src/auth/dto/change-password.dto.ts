import { IsString } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/is-strong-password.decorator';

export class ChangePasswordDto {
  @IsString()
  current_password!: string;

  @IsString()
  @IsStrongPassword()
  new_password!: string;
}
