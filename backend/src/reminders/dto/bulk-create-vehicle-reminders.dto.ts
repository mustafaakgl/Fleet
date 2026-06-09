import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { CreateVehicleReminderDto } from './create-vehicle-reminder.dto';

export class BulkCreateVehicleRemindersDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateVehicleReminderDto)
  items!: CreateVehicleReminderDto[];
}
