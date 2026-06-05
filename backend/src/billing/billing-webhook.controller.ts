import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from './billing.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('billing/webhook')
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  handleWebhook(
    @Req() req: RawBodyRequest,
    @Headers('stripe-signature') signature?: string,
  ) {
    const payload = req.rawBody ?? (req.body as Buffer);
    if (!signature) {
      throw new Error('Missing stripe-signature header');
    }
    return this.billing.handleStripeWebhook(payload, signature);
  }
}
