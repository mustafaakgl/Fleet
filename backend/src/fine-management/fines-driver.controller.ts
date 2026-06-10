import { Body, Controller, Get, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AcknowledgeFineDto } from './dto/acknowledge-fine.dto';
import { FinesService } from './fines.service';

@Controller('driver/fines')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class FinesDriverController {
  constructor(private readonly fines: FinesService) {}

  @Get()
  listMine(@CurrentUser('id') userId: string) {
    return this.fines.getDriverFines(userId);
  }

  @Get(':id')
  async getById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const rows = await this.fines.getDriverFines(userId);
    const row = rows.find((item) => item.id === id);
    if (!row) throw new NotFoundException('Fine not found');
    return row;
  }

  @Post(':id/acknowledge')
  acknowledge(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: AcknowledgeFineDto,
  ) {
    return this.fines.acknowledgeFine(userId, id, dto.ack_metadata);
  }

  @Get(':id/document')
  streamDocument(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') actorRole: string,
    @Res() res: Response,
  ) {
    return this.fines.streamDocument(id, userId, actorRole, res, { driverSelfUserId: userId });
  }
}
