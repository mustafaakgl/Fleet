import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

const INVITABLE_ROLES: UserRole[] = [
  UserRole.admin,
  UserRole.boss,
  UserRole.accounting,
  UserRole.office,
  UserRole.driver,
];

export { INVITABLE_ROLES };

export class CreateInvitationDto {
  @IsString()
  @MinLength(2)
  full_name!: string;

  @IsEmail()
  email!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsString()
  language?: string;
}
