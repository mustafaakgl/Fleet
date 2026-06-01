import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MorningCheckinsController } from './morning-checkins.controller';
import { MorningCheckinsService } from './morning-checkins.service';

@Module({
  imports: [PrismaModule],
  controllers: [MorningCheckinsController],
  providers: [MorningCheckinsService],
  exports: [MorningCheckinsService],
})
export class MorningCheckinsModule {}
