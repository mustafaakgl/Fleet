import { Equals, IsString, MinLength } from 'class-validator';

export class AnonymizeUserDto {
  @IsString()
  @Equals('DELETE')
  confirm!: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}
