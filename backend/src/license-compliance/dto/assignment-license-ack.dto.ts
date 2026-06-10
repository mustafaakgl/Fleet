import { IsBoolean, IsOptional } from 'class-validator';

export class AssignmentLicenseAckFields {
  @IsOptional()
  @IsBoolean()
  acknowledge_license_compliance_warning?: boolean;
}
