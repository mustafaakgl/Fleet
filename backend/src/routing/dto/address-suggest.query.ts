import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class AddressSuggestQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  q!: string;

  @IsIn(['city', 'street'])
  kind!: 'city' | 'street';

  /**
   * Sokak aramasi icin zorunlu. Sehirsiz sokak sorgusu guvenilir degil —
   * "Bahnhofstr" sehirsiz sorguda Zürich donduruyor.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
