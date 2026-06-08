import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendCustomerMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}
