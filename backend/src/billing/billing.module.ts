import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [BillingService, StripeService],
  exports: [BillingService],
})
export class BillingModule {}
