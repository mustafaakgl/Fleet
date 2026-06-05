import { IsString } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/is-strong-password.decorator';

export class AcceptInvitationDto {
  @IsString()
  token!: string;

  @IsStrongPassword()
  password!: string;
}
