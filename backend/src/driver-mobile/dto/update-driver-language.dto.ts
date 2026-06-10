import { IsEnum } from 'class-validator';

const SUPPORTED_DRIVER_LANGUAGES = [
  'de',
  'tr',
  'en',
  'pl',
  'ro',
  'bg',
  'ar',
  'uk',
  'fr',
  'it',
  'es',
  'nl',
  'ru',
] as const;

export class UpdateDriverLanguageDto {
  @IsEnum(SUPPORTED_DRIVER_LANGUAGES)
  language!: (typeof SUPPORTED_DRIVER_LANGUAGES)[number];
}
