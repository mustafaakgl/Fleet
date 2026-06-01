import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveRequestsService } from './leave-requests.service';

@Module({
  imports: [PrismaModule, CalendarModule],
  controllers: [LeaveRequestsController],
  providers: [LeaveRequestsService],
  exports: [LeaveRequestsService],
})
export class LeaveRequestsModule {}
