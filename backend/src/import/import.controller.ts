import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ADMIN_ONLY_ROLES } from '../common/utils/permissions';
import { ImportService } from './import.service';

type UploadedCsvFile = {
  buffer: Buffer;
};

@Controller('import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ONLY_ROLES)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('drivers')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  importDrivers(
    @UploadedFile() file: UploadedCsvFile,
    @CurrentUser('id') actorUserId: string,
  ) {
    const content = file?.buffer?.toString('utf8') ?? '';
    return this.importService.importDriversCsv(content, actorUserId);
  }

  @Post('vehicles')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  importVehicles(
    @UploadedFile() file: UploadedCsvFile,
    @CurrentUser('id') actorUserId: string,
  ) {
    const content = file?.buffer?.toString('utf8') ?? '';
    return this.importService.importVehiclesCsv(content, actorUserId);
  }
}
