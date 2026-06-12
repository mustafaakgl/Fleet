import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { IngestTelematicsDto } from './dto/ingest-telematics.dto';
import { LiveTrackingQueryDto } from './dto/live-tracking-query.dto';
import { LocationHistoryQueryDto } from './dto/location-history-query.dto';
import { TrackingService } from './tracking.service';

@Controller('tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get('live/stream')
  async streamLiveTracking(
    @Query() query: LiveTrackingQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const pollMs = 15_000;

    const sendSnapshot = async () => {
      try {
        const items = await this.trackingService.getLiveTracking({
          staleAfterSec: query.staleAfterSec ?? 300,
          includeOffline: query.includeOffline ?? false,
          search: query.search,
        });
        res.write(`event: live\ndata:${JSON.stringify(items)}\n\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'live_stream_failed';
        res.write(`event: error\ndata:${JSON.stringify({ message })}\n\n`);
      }
    };

    void sendSnapshot();
    const interval = setInterval(() => {
      void sendSnapshot();
    }, pollMs);

    req.on('close', () => {
      clearInterval(interval);
      res.end();
    });
  }

  @Get('live')
  getLiveTracking(@Query() query: LiveTrackingQueryDto) {
    return this.trackingService.getLiveTracking({
      staleAfterSec: query.staleAfterSec ?? 300,
      includeOffline: query.includeOffline ?? false,
      search: query.search,
    });
  }

  @Post('telematics/ingest')
  @RequiresWrite()
  ingestTelematics(@Body() dto: IngestTelematicsDto) {
    return this.trackingService.ingestTelematicsLocation(dto);
  }

  @Get('drivers/:driverId/latest')
  getDriverLatest(@Param('driverId') driverId: string) {
    return this.trackingService.getDriverLatest(driverId);
  }

  @Get('drivers/:driverId/history')
  getDriverHistory(
    @Param('driverId') driverId: string,
    @Query() query: LocationHistoryQueryDto,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.trackingService.getDriverHistory(driverId, {
      from: query.from,
      to: query.to,
      limit: query.limit ?? 500,
    }, currentUserId);
  }

  @Get('vehicles/:vehicleId/history')
  getVehicleHistory(
    @Param('vehicleId') vehicleId: string,
    @Query() query: LocationHistoryQueryDto,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.trackingService.getVehicleHistory(vehicleId, {
      from: query.from,
      to: query.to,
      limit: query.limit ?? 500,
    }, currentUserId);
  }
}
