import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { FuelCompatibilitySource, FuelProductType, FuelProductUsage } from '@prisma/client';

export class FuelCompatibilityEntryDto {
  @IsEnum(FuelProductType)
  productType!: FuelProductType;

  @IsEnum(FuelProductUsage)
  usageType!: FuelProductUsage;

  /**
   * Varsayilan true. false, "acikca onaylanmadi" demek — kaydin yoklugundan
   * farkli bir bilgi (ureticinin acik reddi), her iki durumda da urun
   * filtreye girmez.
   */
  @IsOptional()
  @IsBoolean()
  approved?: boolean;

  @IsEnum(FuelCompatibilitySource)
  source!: FuelCompatibilitySource;

  @IsOptional()
  @IsDateString()
  verifiedAt?: string;
}

/**
 * Tum uyumluluk setini degistirir (PUT semantigi).
 *
 * Bos dizi gecerli: aracin uyumlulugunu "tanimsiz"a geri dondurmenin yolu.
 * Ust sinir, enum degeri sayisi x kullanim turu sayisindan fazlasinin anlamsiz
 * olmasindan geliyor.
 */
export class ReplaceFuelCompatibilityDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => FuelCompatibilityEntryDto)
  entries!: FuelCompatibilityEntryDto[];
}
