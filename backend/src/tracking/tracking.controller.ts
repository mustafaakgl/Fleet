import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { IngestTelemetryDto } from './dto/ingest-telemetry.dto';
import { IngestTelematicsDto } from './dto/ingest-telematics.dto';
import { LiveTrackingQueryDto } from './dto/live-tracking-query.dto';
import { LocationHistoryQueryDto } from './dto/location-history-query.dto';
import { TelematicsVehicleHistoryQueryDto } from './dto/telematics-vehicle-history-query.dto';
import { DeviceIngestApiKeyGuard } from './guards/device-ingest-api-key.guard';
import { TrackingService } from './tracking.service';

@Controller('tracking')
@Roles(...OPERATIONAL_ROLES)
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get('live/stream')
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  getLiveTracking(@Query() query: LiveTrackingQueryDto) {
    return this.trackingService.getLiveTracking({
      staleAfterSec: query.staleAfterSec ?? 300,
      includeOffline: query.includeOffline ?? false,
      search: query.search,
    });
  }

  @Post('telematics/ingest')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequiresWrite()
  ingestTelematics(@Body() dto: IngestTelematicsDto) {
    return this.trackingService.ingestTelematicsLocation(dto);
  }

  @Post('telematics/telemetry')
  @Public()
  @UseGuards(DeviceIngestApiKeyGuard)
  ingestTelemetry(@Body() dto: IngestTelemetryDto) {
    return this.trackingService.ingestTelemetry(dto);
  }

  @Get('telematics/vehicle-health')
  @UseGuards(JwtAuthGuard, RolesGuard)
  getVehicleHealth() {
    return this.trackingService.getTelematicsVehicleHealth();
  }

  @Get('telematics/driver-scores')
  @UseGuards(JwtAuthGuard, RolesGuard)
  getDriverScores() {
    return this.trackingService.getTelematicsDriverScores();
  }

  @Get('telematics/vehicles/:vehicleId/history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  getTelematicsVehicleHistory(
    @Param('vehicleId') vehicleId: string,
    @Query() query: TelematicsVehicleHistoryQueryDto,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.trackingService.getTelematicsVehicleHistory(
      vehicleId,
      {
        from: query.from,
        to: query.to,
        metric: query.metric,
        limit: query.limit,
      },
      currentUserId,
    );
  }

  @Get('drivers/:driverId/latest')
  @UseGuards(JwtAuthGuard, RolesGuard)
  getDriverLatest(@Param('driverId') driverId: string) {
    return this.trackingService.getDriverLatest(driverId);
  }

  @Get('drivers/:driverId/history')
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
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
