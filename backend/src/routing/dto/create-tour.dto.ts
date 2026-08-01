import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTourDto {
  /**
   * Tura girecek gorevler. Ust sinir siralayicinin pratik kapasitesinden
   * geliyor: her gorev iki durak uretir ve mevcut siralayici en fazla
   * 20 durak destekliyor.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  @IsString({ each: true })
  assignment_ids!: string[];

  @IsDateString()
  work_date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  vehicle_id?: string;

  @IsOptional()
  @IsString()
  driver_id?: string;

  /** Turun basladigi ve dondugu nokta; verilmezse ilk/son durak esas alinir */
  @IsOptional()
  @IsString()
  depot_location_id?: string;
}
