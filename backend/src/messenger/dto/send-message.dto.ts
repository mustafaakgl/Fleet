import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

const SUPPORTED_LANGUAGES = ['de', 'tr', 'en'] as const;

export class SendMessageDto {
  @IsString()
  @MaxLength(5000)
  text!: string;

  @IsEnum(SUPPORTED_LANGUAGES)
  originalLanguage!: (typeof SUPPORTED_LANGUAGES)[number];

  @IsOptional()
  @IsEnum(SUPPORTED_LANGUAGES)
  targetLanguage?: (typeof SUPPORTED_LANGUAGES)[number];
}
