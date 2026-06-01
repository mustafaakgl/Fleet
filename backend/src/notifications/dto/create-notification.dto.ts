import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const NOTIFICATION_TYPES = [
  'transport_request',
  'request',
  'document',
  'handover',
  'accident',
  'cargo_damage',
  'company_email',
  'reminder',
  'system',
] as const;

const NOTIFICATION_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export class CreateNotificationDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsEnum(NOTIFICATION_TYPES)
  type!: (typeof NOTIFICATION_TYPES)[number];

  @IsOptional()
  @IsEnum(NOTIFICATION_PRIORITIES)
  priority?: (typeof NOTIFICATION_PRIORITIES)[number];

  @IsOptional()
  @IsString()
  relatedEntityType?: string;

  @IsOptional()
  @IsString()
  relatedEntityId?: string;
}
