import { IsLatitude, IsLongitude, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Kullanicinin oneri listesinden sectigi adres.
 *
 * Koordinat istemciden geliyor cunku kullanici onu LISTEDEN SECTI — sunucunun
 * ayni metni yeniden geocode etmesi tahmine geri donmek olurdu ve secimi
 * anlamsizlastirirdi. Tahmin yok: secilen nokta neyse o kaydediliyor.
 */
export class ResolvePickedLocationDto {
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  houseNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  companyId?: string;
}
