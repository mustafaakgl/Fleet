import { IsOptional, IsUUID } from 'class-validator';

export class UploadDriverAttachmentDto {
  @IsOptional()
  @IsUUID()
  client_request_id?: string;
}
