import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DriverBirthdaysService } from './driver-birthdays.service';

@Injectable()
export class DriverBirthdaysScheduler {
  private readonly logger = new Logger(DriverBirthdaysScheduler.name);

  constructor(private readonly driverBirthdays: DriverBirthdaysService) {}

  /** Daily at 08:00 UTC. Set BIRTHDAY_CRON_ENABLED=false to disable. */
  @Cron('0 8 * * *', { timeZone: 'UTC' })
  async handleDailyBirthdays(): Promise<void> {
    if (process.env.BIRTHDAY_CRON_ENABLED === 'false') {
      return;
    }

    try {
      const result = await this.driverBirthdays.sendTodayBirthdayNotifications();
      this.logger.log(
        `Birthday cron finished: sent=${result.sent}, skipped=${result.skipped}, candidates=${result.candidates}`,
      );
    } catch (error) {
      this.logger.error(`Birthday cron failed: ${error}`);
    }
  }
}
