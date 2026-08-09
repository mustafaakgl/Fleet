import { GermanState } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertPublicHolidayDto {
  @IsDateString() date!: string;
  @IsString() @MaxLength(120) name!: string;
  /** Yalnizca kayit: bu satir hangi eyalet listesinden geldi. */
  @IsOptional() @IsEnum(GermanState) bundesland?: GermanState;
}
