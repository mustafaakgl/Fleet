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
   * Opsiyonel daraltici. Verilirse sorgu metnine katilir ve sonuc keskinlesir
   * ("Bahnhofstr" sehirsiz Zürich donduruyor, "Bahnhofstr Köln" dogru adaylari).
   * Bossa serbest arama yapilir; siralamayi cagiran taraf ustlenir.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  /**
   * Formdaki serbest metin ulke alani ("Deutschland", "NL", "Belgien").
   * Tanindigi olcude sonuclar o ulkeye daraltilir; taninmayan metin yok sayilir
   * — bilinmeyen bir ulke adi yuzunden listeyi bosaltmak filtrelememekten kotu.
   */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
