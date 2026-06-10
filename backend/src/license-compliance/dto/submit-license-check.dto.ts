import { IsOptional, IsString } from 'class-validator';

export class SubmitLicenseCheckDto {
  @IsOptional()
  @IsString()
  notes?: string;

  /** JSON string: { front?: PhotoMeta, back?: PhotoMeta, selfie?: PhotoMeta } */
  @IsOptional()
  @IsString()
  photo_metadata?: string;
}

export type PhotoCaptureMeta = {
  captured_at: string;
  latitude?: number;
  longitude?: number;
  accuracy_m?: number;
};
