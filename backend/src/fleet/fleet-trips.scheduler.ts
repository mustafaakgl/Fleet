import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FleetTripProcessingService } from './fleet-trip-processing.service';

@Injectable()
export class FleetTripsScheduler {
  private readonly logger = new Logger(FleetTripsScheduler.name);

  constructor(private readonly processing: FleetTripProcessingService) {}

  /** Close active trips with no location activity for 10+ minutes. */
  @Cron('*/2 * * * *')
  async handleStaleTripAutoStop(): Promise<void> {
    if ((process.env.FLEET_TRIP_CRON_ENABLED ?? 'true').toLowerCase() === 'false') {
      return;
    }

    try {
      const result = await this.processing.autoStopStaleTrips();
      if (result.closed > 0) {
        this.logger.log(`Fleet trip auto-stop: closed=${result.closed}`);
      }
    } catch (error) {
      this.logger.error(`Fleet trip auto-stop cron failed: ${error}`);
    }
  }
}
